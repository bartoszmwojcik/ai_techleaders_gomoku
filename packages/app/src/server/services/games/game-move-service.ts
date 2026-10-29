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

type GameRow = {
  status: string;
  black_seat: number | null;
  move_count: number;
  stones_black: string;
  stones_white: string;
  moves: Uint8Array;
  seat: number;
};

// The game row is the lock target of every mutation (#22): one locked read with the caller's
// seat. `for no key update` does not block the foreign-key checks of inserts into game_players.
const LOCK_GAME_SQL = `
  select g.status, g.black_seat, g.move_count, g.stones_black::text as stones_black,
    g.stones_white::text as stones_white, g.moves, p.seat
  from games g join game_players p on p.game_id = g.id
  where g.id = ? and p.id = ?
  for no key update of g`;

// The conditional update is the second line of defence after the lock: a move is written only
// to the game state it was computed from.
const MOVE_SQL = `
  update games set stones_black = ?::bit(225), stones_white = ?::bit(225),
    moves = moves || ?::bytea, move_count = move_count + 1
  where id = ? and status = 'active' and move_count = ?
  returning id`;

const FINISHING_MOVE_SQL = `
  update games set stones_black = ?::bit(225), stones_white = ?::bit(225),
    moves = moves || ?::bytea, move_count = move_count + 1,
    status = 'finished', winner_seat = ?, end_reason = ?, finished_at = ?
  where id = ? and status = 'active' and move_count = ?
  returning id`;

const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

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
   * `200` even when it ended the game), settlement of an expired clock (#23 hook), game
   * status, turn, move number, free cell.
   * @throws AppError 404 for a stranger; 409 `GAME_NOT_ACTIVE`, `GAME_FINISHED`,
   * `NOT_YOUR_TURN`, `STALE_MOVE`, `CELL_OCCUPIED`
   */
  async play(
    participant: GameParticipant,
    gameId: string,
    input: MoveCreateInput,
  ): Promise<GameState> {
    const cell = cellOf(input.x, input.y);
    return this.#em.transactional(async (tx) => {
      const [row] = await tx.execute<GameRow[]>(LOCK_GAME_SQL, [gameId, participant.playerId]);
      if (!row) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);

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
        return this.#gameService.stateOf(tx, participant, gameId, after);
      }

      // #23 hook: finishes the game by time under this lock; a settled game is finished.
      if (await this.#timeoutSettler.settleGame(gameId, tx)) throw gameFinished();
      if (row.status === "finished") throw gameFinished();
      if (row.status !== "active" || blackSeat === null) {
        throw new ConflictError(GAME_NOT_ACTIVE_MESSAGE, { code: "GAME_NOT_ACTIVE" });
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
      const board = [
        encodeBitboard(state.black),
        encodeBitboard(state.white),
        Buffer.from([cell]),
      ];
      const written = result
        ? await tx.execute<{ id: string }[]>(FINISHING_MOVE_SQL, [
            ...board,
            result.winnerSeat,
            result.reason,
            this.#clock.now(),
            gameId,
            row.move_count,
          ])
        : await tx.execute<{ id: string }[]>(MOVE_SQL, [...board, gameId, row.move_count]);
      if (written.length === 0) throw staleMove();
      if (result) await tx.execute(RELEASE_SLOTS_SQL, [gameId], "run");

      return this.#gameService.stateOf(tx, participant, gameId, after);
    });
  }
}

function gameFinished(): ConflictError {
  return new ConflictError(GAME_FINISHED_MESSAGE, { code: "GAME_FINISHED" });
}

function staleMove(): ConflictError {
  return new ConflictError(STALE_MOVE_MESSAGE, { code: "STALE_MOVE" });
}
