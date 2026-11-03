import { randomUUID } from "node:crypto";

import {
  GUEST_TOKEN_GRACE_MS,
  MCP_CHAT_PAGE,
  MCP_CHAT_TAIL,
  BOARD_SIZE,
  PAPER_BOARD_SIZE,
  MCP_POLL_INTERVAL_MS,
  MCP_TOKEN_WINDOW_MS,
  NotFoundError,
  ValidationError,
  agentChatView,
  agentGameView,
  agentGetStateSchema,
  agentPlayMoveSchema,
  agentSendMessageSchema,
  looksLikeSecret,
  seatOnTurn,
  seatOutOfTime,
  type AgentChatStatus,
  type AgentChatView,
  type AgentGameState,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { ServerConfig } from "../../config";
import { hashOpaqueToken } from "../../http/opaque-token";
import { sleep as realSleep, type Sleep } from "../../mcp/sleep";
import type { ChatService } from "../chat/chat-service";
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
  chatService: ChatService;
};

export const OUT_OF_BOARD_MESSAGE = "Pole jest poza planszą (współrzędne 0–14).";
export const OUT_OF_PAPER_BOARD_MESSAGE = `Pole jest poza planszą (współrzędne 0–${PAPER_BOARD_SIZE - 1}).`;
export const INVALID_TOKEN_TEXT = "Nie znaleziono partii.";
export const SECRET_MESSAGE = "Wiadomość wygląda na token lub inny sekret, więc nie została wysłana.";

/** The result of `send_message`: the stored text (after NFKC) and the chat as it now is. */
export type AgentSentMessage = {
  message: { id: number; from: "you"; text: string; untrusted: false };
  retryAfterMs: number;
  chatStatus: AgentChatStatus;
};

type Pool = { prefix: string; limit: (config: ServerConfig) => number };
const TOKEN_POOL: Pool = { prefix: "mcp-token", limit: ({ mcp }) => mcp.tokenLimit };
// BR-32: `send_message` has a pool of its own, so it neither uses up nor is stopped by the 60 a minute of D-29.
const CHAT_POOL: Pool = { prefix: "mcp-chat", limit: ({ mcp }) => mcp.chatLimit };

// The seat of an agent token while the token is valid (BR-31): same lifetime as a guest token.
const FIND_BY_TOKEN_SQL = `
  select p.id, p.game_id, g.variant from game_players p join games g on g.id = p.game_id
  where p.agent_token_hash = ? and ${PARTICIPANT_TOKEN_VALID_SQL}`;

// What a waiting `get_state` needs to know whether to stop waiting: one cheap read, no locks.
// The start of the turn is computed in SQL (dates come back from `em.execute` as text). A paper game
// (E11) keeps its count, the automat's seat and the pending stone in `paper_game_states`, so the
// columns come from there (`coalesce` over the left join leaves a classic game as it was).
const PEEK_SQL = `
  select g.status, g.black_seat, g.variant, coalesce(s.move_count, g.move_count) as move_count,
    g.clock_ms_1, g.clock_ms_2, p.seat,
    (extract(epoch from g.turn_started_at) * 1000)::float8 as turn_started_ms,
    s.auto_seat, (extract(epoch from s.pending_auto_at) * 1000)::float8 as pending_ms,
    (select max(m.seq) from chat_messages m where m.game_id = g.id and m.sender_id <> p.id)::int as opponent_last_seq
  from games g join game_players p on p.game_id = g.id
  left join paper_game_states s on s.game_id = g.id
  where g.id = ? and p.id = ?`;

type PeekRow = {
  status: string;
  black_seat: number | null;
  variant?: string;
  move_count: number;
  clock_ms_1: number;
  clock_ms_2: number;
  seat: number;
  turn_started_ms: number | null;
  /** The paper game's automat: its seat and when its next stone is due. */
  auto_seat?: number | null;
  pending_ms?: number | null;
  /** The newest message of the other participant. */
  opponent_last_seq: number | null;
};

type Seated = { participant: GameParticipant; gameId: string; variant: string | undefined };

/** `INVALID_INPUT` naming the field only, never the value (decision 8: no echo of the input). */
function invalidInput(field: string): ValidationError {
  return new ValidationError(`Nieprawidłowe pole: ${field}.`, {
    code: "INVALID_INPUT",
  });
}

/**
 * The tools `get_state`, `play_move` and `send_message` of an agent (E06-S02, E07-S04, D-29, D-31). An adapter: it recognizes the
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
  readonly #chatService: ChatService;

  constructor({ em, clock, rateLimiter, serverConfig, gameService, gameMoveService, chatService }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#rateLimiter = rateLimiter;
    this.#serverConfig = serverConfig;
    this.#gameService = gameService;
    this.#gameMoveService = gameMoveService;
    this.#chatService = chatService;
  }

  /**
   * The state of the agent's game (also after the end, until the token expires). With
   * `waitSeconds` it waits, by cheap reads without a transaction, until it is the agent's turn,
   * the game ends, the time of the side on move is up, the wait is over or the request is
   * cancelled (with `afterMessage`: or the opponent has written something newer); then one `GameService.getState` does the lazy bookkeeping and reads the state.
   * @throws AppError 400 `INVALID_INPUT`; 404 for an unknown token; 429 `RATE_LIMITED`
   */
  async getState(
    raw: unknown,
    options: { signal?: AbortSignal; sleep?: Sleep } = {},
  ): Promise<AgentGameState & AgentChatView> {
    const parsed = agentGetStateSchema.safeParse(raw ?? {});
    if (!parsed.success) throw invalidInput(parsed.error.issues[0]!.message);
    const { token, waitSeconds, afterMove, afterMessage } = parsed.data;
    const seated = await this.#admit(token, TOKEN_POOL);

    const { signal, sleep = realSleep } = options;
    // One round per second, counted rather than timed: bounded whatever the clock does.
    for (let round = 0; round < (waitSeconds ?? 0); round++) {
      if (signal?.aborted || (await this.#ready(seated, afterMessage ?? null))) break;
      await sleep(MCP_POLL_INTERVAL_MS, signal);
    }

    const state = await this.#gameService.getState(seated.participant, seated.gameId);
    if ((afterMove ?? 0) > state.moveCount) throw invalidInput("afterMove");
    // The chat is read after the game, outside any wait: a read of its own, no transaction (R6).
    const chat = await this.#chatService.read(
      seated.participant,
      seated.gameId,
      afterMessage == null ? { limit: MCP_CHAT_TAIL } : { afterId: afterMessage, limit: MCP_CHAT_PAGE },
    );
    return { ...viewOf(state, afterMove ?? 0), ...agentChatView(chat, state.you.seat) };
  }

  /**
   * Writes a message for the agent through the same `ChatService` as a person's (one set of rules),
   * with its own pool of requests per token. Never waits: a too quick second message is
   * `RATE_LIMITED` with the exact wait. The order is shape, token, pool, secret, chat; a text that
   * looks like a token is refused before it is stored, and only the counter of the pool moves.
   * @throws AppError 400 `VALIDATION` with `data.reason`; 404 for an unknown token; 409
   * `CHAT_UNAVAILABLE` / `CHAT_DISABLED` / `CHAT_FULL`; 429 `RATE_LIMITED`
   */
  async sendMessage(raw: unknown): Promise<AgentSentMessage> {
    const parsed = agentSendMessageSchema.safeParse(raw ?? {});
    if (!parsed.success) throw invalidInput(parsed.error.issues[0]!.message);
    const { token, text } = parsed.data;
    const { participant, gameId } = await this.#admit(token, CHAT_POOL);
    if (typeof text === "string" && looksLikeSecret(text, token)) {
      throw new ValidationError(SECRET_MESSAGE, { data: { reason: "secret" } });
    }
    // The model gives no id of the attempt (R9): a retry after a lost answer may add a second message.
    const sent = await this.#chatService.send(participant, gameId, { text, clientId: randomUUID() });
    return {
      message: { id: sent.message.id, from: "you", text: sent.message.text, untrusted: false },
      retryAfterMs: sent.retryAfterMs,
      chatStatus: "open",
    };
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
    const seated = await this.#admit(token, TOKEN_POOL);
    // The sheet of the paper variant (E11) is 101×101; the range depends on the game, so it is checked here.
    const paper = seated.variant === "paper";
    const size = paper ? PAPER_BOARD_SIZE : BOARD_SIZE;
    if (x < 0 || x >= size || y < 0 || y >= size) {
      throw new ValidationError(paper ? OUT_OF_PAPER_BOARD_MESSAGE : OUT_OF_BOARD_MESSAGE, { code: "ILLEGAL_MOVE" });
    }

    await this.#gameMoveService.play(seated.participant, seated.gameId, { x, y, moveNumber });
    return viewOf(await this.#gameService.getState(seated.participant, seated.gameId), 0);
  }

  /** The seat behind a token, after the limit of that token; a stranger is `404` before any count. */
  async #admit(token: string, pool: Pool): Promise<Seated> {
    const cutoff = new Date(this.#clock.now().getTime() - GUEST_TOKEN_GRACE_MS);
    const hash = hashOpaqueToken(token);
    const [row] = await this.#em.execute<{ id: string; game_id: string; variant?: string }[]>(FIND_BY_TOKEN_SQL, [
      hash,
      cutoff,
    ]);
    if (!row) throw new NotFoundError(INVALID_TOKEN_TEXT);
    await this.#rateLimiter.hit(`${pool.prefix}:${hash}`, pool.limit(this.#serverConfig), MCP_TOKEN_WINDOW_MS);
    return { participant: { playerId: row.id }, gameId: row.game_id, variant: row.variant };
  }

  /** Whether a waiting `get_state` has something to report. A vanished game is reported too. */
  async #ready({ participant, gameId }: Seated, afterMessage: number | null): Promise<boolean> {
    const [row] = await this.#em.execute<PeekRow[]>(PEEK_SQL, [gameId, participant.playerId]);
    if (!row || row.status !== "active" || row.black_seat === null) return true;
    // Only a cursor wakes the wait for a message: without it nothing changes for older clients (R5).
    if (afterMessage !== null && (row.opponent_last_seq ?? 0) > afterMessage) return true;
    const seat = row.seat as Seat;
    const nowMs = this.#clock.now().getTime();
    const turnSeat = seatOnTurn(row.move_count, row.black_seat as Seat);
    const autoSeat = (row.auto_seat ?? null) as Seat | null;
    // While the automat plays for the agent (E11) the turn is nominally the agent's, but it cannot move.
    if (turnSeat === seat && autoSeat !== seat) return true;
    // The automat's stone is due: reading settles it, and the agent sees it before `waitSeconds` ends.
    if (row.pending_ms != null && Number(row.pending_ms) <= nowMs) return true;
    const turnStartedAtMs = row.turn_started_ms === null ? null : Math.floor(Number(row.turn_started_ms));
    // The clock that runs is the opponent's of the automat's seat in its phase, else the seat on turn.
    const clockSeat: Seat = autoSeat === null ? turnSeat : autoSeat === 1 ? 2 : 1;
    return (
      seatOutOfTime({ clockMs: [row.clock_ms_1, row.clock_ms_2], turnStartedAtMs, turnSeat: clockSeat }, nowMs) !==
      null
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
      variant: state.variant,
      paper: state.paper,
    },
    afterMove,
  );
}
