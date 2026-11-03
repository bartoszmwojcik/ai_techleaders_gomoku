import {
  AUTO_MOVE_DELAY_MS,
  ConflictError,
  ValidationError,
  refusalIn,
  indexStones,
  scoreGame,
  seatOnTurn,
  spend,
  stonesOf,
  type AppError,
  type MoveCreateInput,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { Clock } from "../email/email-sender";
import type { GameParticipant, GameService, GameState } from "./game-service";
import { loadPaperSnapshot } from "./paper-state";
import type { PaperSettler } from "./paper-settler";

type Deps = { clock: Clock; gameService: GameService; paperSettler: PaperSettler };

export const AUTO_TURN_MESSAGE = "Automat stawia kamień.";
export const NOT_YOUR_TURN_MESSAGE = "Teraz ruch przeciwnika.";
export const STALE_MOVE_MESSAGE = "Plansza zmieniła się — odśwież widok.";
export const CELL_OCCUPIED_MESSAGE = "To pole jest już zajęte.";
export const GAME_NOT_ACTIVE_MESSAGE = "Ta partia nie jest w toku.";
export const GAME_FINISHED_MESSAGE = "Ta partia jest już zakończona.";
export const GAME_NOT_STARTED_MESSAGE = "Czekamy, aż przeciwnik otworzy partię.";
export const OFF_BOARD_MESSAGE = "Pole jest poza planszą.";
export const FIRST_MOVE_CENTER_MESSAGE = "Pierwszy kamień trafia na środek planszy.";
export const MOVE_TOO_FAR_MESSAGE = "Kamień może stać najwyżej 3 pola od innego.";

/** The paper game's answer to a move: the state, or a refusal the caller throws after the commit. */
export type PaperMoveOutcome = GameState | { refusal: AppError } | "settled";

export type PaperMoveContext = {
  participant: GameParticipant;
  gameId: string;
  seat: Seat;
  now: Date;
  input: MoveCreateInput;
};

type Row = {
  status: string;
  black_seat: number | null;
  clock_ms_1: number;
  clock_ms_2: number;
  turn_started_ms: number | null;
};

const GAME_SQL = `
  select status, black_seat, clock_ms_1, clock_ms_2,
    (extract(epoch from turn_started_at) * 1000)::float8 as turn_started_ms
  from games where id = ?`;
const RETRY_SQL = `select x, y, seat from paper_moves where game_id = ? and move_number = ?`;
const INSERT_MOVE_SQL = `
  insert into paper_moves (game_id, move_number, x, y, seat, is_auto, played_at)
  values (?, ?, ?, ?, ?, false, ?)`;
const UPDATE_STATE_SQL = `
  update paper_game_states set move_count = move_count + 1, score_1 = ?, score_2 = ?,
    pending_auto_at = ?, last_move_at = ?
  where game_id = ? and move_count = ?
  returning game_id`;
const UPDATE_CLOCK_SQL = `
  update games set clock_ms_1 = ?, clock_ms_2 = ?, turn_started_at = ? where id = ? and status = 'active'`;

/**
 * One move of the paper game (E11), called by `GameMoveService` under the row lock of `games`.
 * The same entry for HTTP and MCP. Refusals are returned, not thrown: an error inside the
 * transaction would roll back what `PaperSettler` materialized on the way.
 */
export class PaperMoveService {
  readonly #clock: Clock;
  readonly #gameService: GameService;
  readonly #paperSettler: PaperSettler;

  constructor({ clock, gameService, paperSettler }: Deps) {
    this.#clock = clock;
    this.#gameService = gameService;
    this.#paperSettler = paperSettler;
  }

  async play(tx: EntityManager, { participant, gameId, seat, now, input }: PaperMoveContext): Promise<PaperMoveOutcome> {
    const after = input.moveNumber - 1;

    // Retry: the same cell under the same number by the seat that owns that number.
    const [same] = await tx.execute<{ x: number; y: number; seat: number }[]>(RETRY_SQL, [gameId, input.moveNumber]);
    if (same && same.seat === seat && same.x === input.x && same.y === input.y) {
      return this.#gameService.stateOf(tx, participant, gameId, after, now);
    }

    if ((await this.#paperSettler.settle(gameId, tx, now)).finished) return "settled";
    const [row] = await tx.execute<Row[]>(GAME_SQL, [gameId]);
    if (row!.status === "finished") return { refusal: new ConflictError(GAME_FINISHED_MESSAGE, { code: "GAME_FINISHED" }) };
    if (row!.status !== "active" || row!.black_seat === null) {
      return { refusal: new ConflictError(GAME_NOT_ACTIVE_MESSAGE, { code: "GAME_NOT_ACTIVE" }) };
    }
    if (row!.turn_started_ms === null) {
      return { refusal: new ConflictError(GAME_NOT_STARTED_MESSAGE, { code: "GAME_NOT_STARTED" }) };
    }
    const snapshot = (await loadPaperSnapshot(tx, gameId))!;
    const onTurn = seatOnTurn(snapshot.moveCount, row!.black_seat as Seat);
    // The seat the automat plays for never moves by hand, also when it is on turn (BR-50).
    if (onTurn !== seat || snapshot.autoSeat === seat) {
      const message = onTurn === snapshot.autoSeat ? AUTO_TURN_MESSAGE : NOT_YOUR_TURN_MESSAGE;
      return { refusal: new ConflictError(message, { code: "NOT_YOUR_TURN" }) };
    }
    if (input.moveNumber !== snapshot.moveCount + 1) return { refusal: staleMove() };

    const stones = stonesOf(snapshot.moves);
    const why = refusalIn(indexStones(stones), input.x, input.y);
    if (why === "CELL_OCCUPIED") return { refusal: new ConflictError(CELL_OCCUPIED_MESSAGE, { code: "CELL_OCCUPIED" }) };
    if (why === "OFF_BOARD") return { refusal: new ValidationError(OFF_BOARD_MESSAGE) };
    if (why === "FIRST_MOVE_CENTER") {
      return { refusal: new ValidationError(FIRST_MOVE_CENTER_MESSAGE, { code: "FIRST_MOVE_CENTER" }) };
    }
    if (why === "MOVE_TOO_FAR") return { refusal: new ValidationError(MOVE_TOO_FAR_MESSAGE, { code: "MOVE_TOO_FAR" }) };

    const { scores } = scoreGame([...stones, { x: input.x, y: input.y, seat, auto: false }]);
    // While the automat plays for the opponent the player's clock runs without a break (BR-50),
    // so a move neither charges nor restarts it; the automat answers two seconds later.
    const pending = snapshot.autoSeat === null ? null : new Date(now.getTime() + AUTO_MOVE_DELAY_MS);
    const written = await tx.execute<{ game_id: string }[]>(UPDATE_STATE_SQL, [
      scores[0],
      scores[1],
      pending,
      now,
      gameId,
      snapshot.moveCount,
    ]);
    if (written.length === 0) return { refusal: staleMove() };
    await tx.execute(INSERT_MOVE_SQL, [gameId, input.moveNumber, input.x, input.y, seat, now], "run");
    if (snapshot.autoSeat === null) {
      const left = spend(
        {
          clockMs: [row!.clock_ms_1, row!.clock_ms_2],
          turnStartedAtMs: Math.floor(Number(row!.turn_started_ms)),
          turnSeat: seat,
        },
        seat,
        now.getTime(),
      ).clockMs;
      await tx.execute(
        UPDATE_CLOCK_SQL,
        [seat === 1 ? left : row!.clock_ms_1, seat === 2 ? left : row!.clock_ms_2, now, gameId],
        "run",
      );
    }
    return this.#gameService.stateOf(tx, participant, gameId, after, now);
  }
}

function staleMove(): ConflictError {
  return new ConflictError(STALE_MOVE_MESSAGE, { code: "STALE_MOVE" });
}
