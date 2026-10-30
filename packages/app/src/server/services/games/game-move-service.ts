import {
  ConflictError,
  NotFoundError,
  ValidationError,
  applyMove,
  cellOf,
  decodeBitboard,
  decodeMoves,
  encodeBitboard,
  seatOnTurn,
  spend,
  type MoveCreateInput,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { Clock } from "../email/email-sender";
import {
  GAME_NOT_FOUND_MESSAGE,
  type GameParticipant,
  type GameService,
  type GameState,
} from "./game-service";
import type { TimeoutSettler } from "./timeout-settler";

type Deps = {
  em: EntityManager;
  clock: Clock;
  gameService: GameService;
  timeoutSettler: TimeoutSettler;
};

export const GAME_NOT_ACTIVE_MESSAGE = "Ta partia nie jest w toku.";
export const GAME_FINISHED_MESSAGE = "Ta partia jest już zakończona.";
export const NOT_YOUR_TURN_MESSAGE = "Teraz ruch przeciwnika.";
export const STALE_MOVE_MESSAGE = "Plansza zmieniła się — odśwież widok.";
export const CELL_OCCUPIED_MESSAGE = "To pole jest już zajęte.";
export const GAME_NOT_STARTED_MESSAGE = "Czekamy, aż przeciwnik otworzy partię.";

type GameRow = {
  status: string;
  black_seat: number | null;
  move_count: number;
  stones_black: string;
  stones_white: string;
  moves: Uint8Array;
  clock_ms_1: number;
  clock_ms_2: number;
  /** `turn_started_at` in epoch milliseconds, computed in SQL (dates come back as text). */
  turn_started_ms: number | null;
  seat: number;
};

// The game row is the lock target of every mutation (#22): one locked read with the caller's
// seat. `for no key update` does not block the foreign-key checks of inserts into game_players.
const LOCK_GAME_SQL = `
  select g.status, g.black_seat, g.move_count, g.stones_black::text as stones_black,
    g.stones_white::text as stones_white, g.moves, g.clock_ms_1, g.clock_ms_2,
    (extract(epoch from g.turn_started_at) * 1000)::float8 as turn_started_ms, p.seat
  from games g join game_players p on p.game_id = g.id
  where g.id = ? and p.id = ?
  for no key update of g`;

// The conditional update is the second line of defence after the lock: a move is written only
// to the game state it was computed from.
const MOVE_SQL = `
  update games set stones_black = ?::bit(225), stones_white = ?::bit(225),
    moves = moves || ?::bytea, move_count = move_count + 1,
    clock_ms_1 = ?, clock_ms_2 = ?, turn_started_at = ?
  where id = ? and status = 'active' and move_count = ?
  returning id`;

const FINISHING_MOVE_SQL = `
  update games set stones_black = ?::bit(225), stones_white = ?::bit(225),
    moves = moves || ?::bytea, move_count = move_count + 1,
    clock_ms_1 = ?, clock_ms_2 = ?, turn_started_at = ?,
    status = 'finished', winner_seat = ?, end_reason = ?, finished_at = ?
  where id = ? and status = 'active' and move_count = ?
  returning id`;

const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

const SETTLED_BY_TIME = Symbol("settled-by-time");

/** Moves of a running game (#22). Orchestration only: the rules live in `@gomoku/core`. */
export class GameMoveService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #gameService: GameService;
  readonly #timeoutSettler: TimeoutSettler;

  constructor({ em, clock, gameService, timeoutSettler }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#gameService = gameService;
    this.#timeoutSettler = timeoutSettler;
  }

  /**
   * Plays one move for a participant and returns the game state with the moves from
   * `moveNumber - 1` on. Order of checks under the row lock: retry of the same move (answered
   * `200` even when it ended the game), settlement of an expired clock (#23), game
   * status, clock started, turn, move number, free cell. The time of the move is read once,
   * under the lock, and shared by the settlement and the clock charge.
   * @throws AppError 404 for a stranger; 409 `GAME_NOT_ACTIVE`, `GAME_FINISHED`,
   * `GAME_NOT_STARTED`, `NOT_YOUR_TURN`, `STALE_MOVE`, `CELL_OCCUPIED`
   */
  async play(
    participant: GameParticipant,
    gameId: string,
    input: MoveCreateInput,
  ): Promise<GameState> {
    const cell = cellOf(input.x, input.y);
    const played = await this.#em.transactional(async (tx) => {
      const [row] = await tx.execute<GameRow[]>(LOCK_GAME_SQL, [gameId, participant.playerId]);
      if (!row) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);

      const now = this.#clock.now();
      const seat = row.seat as Seat;
      const moves = decodeMoves(row.moves);
      const blackSeat = row.black_seat as Seat | null;
      const after = input.moveNumber - 1;

      // (1) Retry: the same cell under the same number by the seat that owns that number.
      if (
        blackSeat !== null &&
        moves[after] === cell &&
        seatOnTurn(after, blackSeat) === seat
      ) {
        return this.#gameService.stateOf(tx, participant, gameId, after, now);
      }

      // #23: finishes the game by time under this lock; a settled game is finished.
      // Not thrown inside the transaction: the error would roll the settlement back.
      if (await this.#timeoutSettler.settleGame(gameId, tx, now)) return SETTLED_BY_TIME;
      if (row.status === "finished") throw gameFinished();
      if (row.status !== "active" || blackSeat === null) {
        throw new ConflictError(GAME_NOT_ACTIVE_MESSAGE, { code: "GAME_NOT_ACTIVE" });
      }
      if (row.turn_started_ms === null) {
        throw new ConflictError(GAME_NOT_STARTED_MESSAGE, { code: "GAME_NOT_STARTED" });
      }
      if (seatOnTurn(row.move_count, blackSeat) !== seat) {
        throw new ConflictError(NOT_YOUR_TURN_MESSAGE, { code: "NOT_YOUR_TURN" });
      }
      if (input.moveNumber !== row.move_count + 1) throw staleMove();

      const outcome = applyMove(
        {
          black: decodeBitboard(row.stones_black),
          white: decodeBitboard(row.stones_white),
          moveCount: row.move_count,
          blackSeat,
        },
        cell,
      );
      if (!outcome.ok) {
        if (outcome.reason === "occupied") {
          throw new ConflictError(CELL_OCCUPIED_MESSAGE, { code: "CELL_OCCUPIED" });
        }
        throw new ValidationError("Pole jest poza planszą.");
      }

      const { state, result } = outcome;
      const left = spend(
        {
          clockMs: [row.clock_ms_1, row.clock_ms_2],
          turnStartedAtMs: Math.floor(Number(row.turn_started_ms)),
          turnSeat: seat,
        },
        seat,
        now.getTime(),
      ).clockMs;
      const clocks = [
        seat === 1 ? left : row.clock_ms_1,
        seat === 2 ? left : row.clock_ms_2,
        now,
      ];
      const board = [
        encodeBitboard(state.black),
        encodeBitboard(state.white),
        Buffer.from([cell]),
      ];
      const written = result
        ? await tx.execute<{ id: string }[]>(FINISHING_MOVE_SQL, [
            ...board,
            ...clocks,
            result.winnerSeat,
            result.reason,
            now,
            gameId,
            row.move_count,
          ])
        : await tx.execute<{ id: string }[]>(MOVE_SQL, [...board, ...clocks, gameId, row.move_count]);
      if (written.length === 0) throw staleMove();
      if (result) await tx.execute(RELEASE_SLOTS_SQL, [gameId], "run");

      return this.#gameService.stateOf(tx, participant, gameId, after, now);
    });
    if (played === SETTLED_BY_TIME) throw gameFinished();
    return played;
  }
}

function gameFinished(): ConflictError {
  return new ConflictError(GAME_FINISHED_MESSAGE, { code: "GAME_FINISHED" });
}

function staleMove(): ConflictError {
  return new ConflictError(STALE_MOVE_MESSAGE, { code: "STALE_MOVE" });
}
