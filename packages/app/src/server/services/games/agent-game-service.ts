import {
  GUEST_TOKEN_GRACE_MS,
  BOARD_SIZE,
  MCP_POLL_INTERVAL_MS,
  MCP_TOKEN_WINDOW_MS,
  NotFoundError,
  ValidationError,
  agentGameView,
  agentGetStateSchema,
  agentPlayMoveSchema,
  seatOnTurn,
  seatOutOfTime,
  type AgentGameState,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { ServerConfig } from "../../config";
import { hashOpaqueToken } from "../../http/opaque-token";
import { sleep as realSleep, type Sleep } from "../../mcp/sleep";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import type { GameMoveService } from "./game-move-service";
import type { GameParticipant, GameService, GameState } from "./game-service";
import { PARTICIPANT_TOKEN_VALID_SQL } from "./participant-token";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  serverConfig: ServerConfig;
  gameService: GameService;
  gameMoveService: GameMoveService;
};

export const OUT_OF_BOARD_MESSAGE = "Pole jest poza planszą (współrzędne 0–14).";
export const INVALID_TOKEN_TEXT = "Nie znaleziono partii.";

// The seat of an agent token while the token is valid (BR-31): same lifetime as a guest token.
const FIND_BY_TOKEN_SQL = `
  select p.id, p.game_id from game_players p join games g on g.id = p.game_id
  where p.agent_token_hash = ? and ${PARTICIPANT_TOKEN_VALID_SQL}`;

// What a waiting `get_state` needs to know whether to stop waiting: one cheap read, no locks.
// The start of the turn is computed in SQL (dates come back from `em.execute` as text).
const PEEK_SQL = `
  select g.status, g.black_seat, g.move_count, g.clock_ms_1, g.clock_ms_2, p.seat,
    (extract(epoch from g.turn_started_at) * 1000)::float8 as turn_started_ms
  from games g join game_players p on p.game_id = g.id
  where g.id = ? and p.id = ?`;

type PeekRow = {
  status: string;
  black_seat: number | null;
  move_count: number;
  clock_ms_1: number;
  clock_ms_2: number;
  seat: number;
  turn_started_ms: number | null;
};

type Seated = { participant: GameParticipant; gameId: string };

/** `INVALID_INPUT` naming the field only, never the value (decision 8: no echo of the input). */
function invalidInput(field: string | number | symbol | undefined): ValidationError {
  return new ValidationError(`Nieprawidłowe pole: ${String(field ?? "wejście")}.`, {
    code: "INVALID_INPUT",
  });
}

/**
 * The tools `get_state` and `play_move` of an agent (E06-S02, D-29). An adapter: it recognizes the
 * token, counts the limit and hands the game to `GameService` / `GameMoveService`, so the rules,
 * the clock and the loss on time are the ones of a human player. It writes nothing of its own
 * (a failed `play_move` leaves the game and the clocks as they were; only the counter of the
 * rate limit moves). Request-scoped: it works through `em`.
 */
export class AgentGameService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #rateLimiter: RateLimiter;
  readonly #serverConfig: ServerConfig;
  readonly #gameService: GameService;
  readonly #gameMoveService: GameMoveService;

  constructor({ em, clock, rateLimiter, serverConfig, gameService, gameMoveService }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#rateLimiter = rateLimiter;
    this.#serverConfig = serverConfig;
    this.#gameService = gameService;
    this.#gameMoveService = gameMoveService;
  }

  /**
   * The state of the agent's game (also after the end, until the token expires). With
   * `waitSeconds` it waits, by cheap reads without a transaction, until it is the agent's turn,
   * the game ends, the time of the side on move is up, the wait is over or the request is
   * cancelled; then one `GameService.getState` does the lazy bookkeeping and reads the state.
   * @throws AppError 400 `INVALID_INPUT`; 404 for an unknown token; 429 `RATE_LIMITED`
   */
  async getState(
    raw: unknown,
    options: { signal?: AbortSignal; sleep?: Sleep } = {},
  ): Promise<AgentGameState> {
    const parsed = agentGetStateSchema.safeParse(raw ?? {});
    if (!parsed.success) throw invalidInput(parsed.error.issues[0]!.message);
    const { token, waitSeconds, afterMove } = parsed.data;
    const seated = await this.#admit(token);

    const { signal, sleep = realSleep } = options;
    // One round per second, counted rather than timed: bounded whatever the clock does.
    for (let round = 0; round < (waitSeconds ?? 0); round++) {
      if (signal?.aborted || (await this.#ready(seated))) break;
      await sleep(MCP_POLL_INTERVAL_MS, signal);
    }

    const state = await this.#gameService.getState(seated.participant, seated.gameId);
    if ((afterMove ?? 0) > state.moveCount) throw invalidInput("afterMove");
    return viewOf(state, afterMove ?? 0);
  }

  /**
   * Plays one move for the agent and returns the state as `get_state` does. A cell off the board
   * is `ILLEGAL_MOVE` (a rule of the game, so after the token), everything else is decided by
   * `GameMoveService.play` under the row lock before its only write.
   * @throws AppError 400 `INVALID_INPUT` / `ILLEGAL_MOVE`; 404 for an unknown token; 409 with the
   * codes of `GameMoveService.play`; 429 `RATE_LIMITED`
   */
  async playMove(raw: unknown): Promise<AgentGameState> {
    const parsed = agentPlayMoveSchema.safeParse(raw ?? {});
    if (!parsed.success) throw invalidInput(parsed.error.issues[0]!.message);
    const { token, x, y, moveNumber } = parsed.data;
    const seated = await this.#admit(token);
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
      throw new ValidationError(OUT_OF_BOARD_MESSAGE, { code: "ILLEGAL_MOVE" });
    }

    await this.#gameMoveService.play(seated.participant, seated.gameId, { x, y, moveNumber });
    return viewOf(await this.#gameService.getState(seated.participant, seated.gameId), 0);
  }

  /** The seat behind a token, after the limit of that token; a stranger is `404` before any count. */
  async #admit(token: string): Promise<Seated> {
    const cutoff = new Date(this.#clock.now().getTime() - GUEST_TOKEN_GRACE_MS);
    const hash = hashOpaqueToken(token);
    const [row] = await this.#em.execute<{ id: string; game_id: string }[]>(FIND_BY_TOKEN_SQL, [
      hash,
      cutoff,
    ]);
    if (!row) throw new NotFoundError(INVALID_TOKEN_TEXT);
    await this.#rateLimiter.hit(`mcp-token:${hash}`, this.#serverConfig.mcp.tokenLimit, MCP_TOKEN_WINDOW_MS);
    return { participant: { playerId: row.id }, gameId: row.game_id };
  }

  /** Whether a waiting `get_state` has something to report. A vanished game is reported too. */
  async #ready({ participant, gameId }: Seated): Promise<boolean> {
    const [row] = await this.#em.execute<PeekRow[]>(PEEK_SQL, [gameId, participant.playerId]);
    if (!row || row.status !== "active" || row.black_seat === null) return true;
    const seat = row.seat as Seat;
    const turnSeat = seatOnTurn(row.move_count, row.black_seat as Seat);
    if (turnSeat === seat) return true;
    const turnStartedAtMs = row.turn_started_ms === null ? null : Math.floor(Number(row.turn_started_ms));
    return (
      seatOutOfTime(
        { clockMs: [row.clock_ms_1, row.clock_ms_2], turnStartedAtMs, turnSeat },
        this.#clock.now().getTime(),
      ) !== null
    );
  }
}

function viewOf(state: GameState, afterMove: number): AgentGameState {
  const opponent = state.players.find(({ seat }) => seat !== state.you.seat)!;
  return agentGameView(
    {
      status: state.status,
      blackSeat: state.blackSeat,
      turnSeat: state.turnSeat,
      moveCount: state.moveCount,
      moves: state.moves,
      result: state.result,
      clock: state.clock,
      you: { seat: state.you.seat },
      opponentKind: opponent.kind,
    },
    afterMove,
  );
}
