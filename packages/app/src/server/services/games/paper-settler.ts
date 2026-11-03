import { deadlineMs, resolvePaperClock, scoreGame, seatOnTurn, stonesOf, type PaperClockState, type Seat } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { Clock } from "../email/email-sender";
import { recordFinishedGame } from "./finished-game-counter";
import { loadPaperSnapshot } from "./paper-state";

type Deps = { clock: Clock; random: () => number };

type GameRow = {
  status: string;
  black_seat: number | null;
  clock_ms_1: number;
  clock_ms_2: number;
  turn_started_ms: number | null;
  auto_seat: number | null;
  pending_ms: number | null;
  move_count: number;
};

// One read of what the timeline needs (E11 BR-50), join on the sheet's state.
const GAME_SQL = `
  select g.status, g.black_seat, g.clock_ms_1, g.clock_ms_2,
    (extract(epoch from g.turn_started_at) * 1000)::float8 as turn_started_ms,
    s.auto_seat, (extract(epoch from s.pending_auto_at) * 1000)::float8 as pending_ms, s.move_count
  from games g join paper_game_states s on s.game_id = g.id
  where g.id = ? and g.variant = 'paper'`;

const INSERT_MOVE_SQL = `
  insert into paper_moves (game_id, move_number, x, y, seat, is_auto, played_at)
  values (?, ?, ?, ?, ?, true, ?)`;
const UPDATE_STATE_SQL = `
  update paper_game_states set move_count = ?, score_1 = ?, score_2 = ?, auto_seat = ?,
    pending_auto_at = null, last_move_at = ?
  where game_id = ?`;
const TAKE_OVER_SQL = (column: "clock_ms_1" | "clock_ms_2") =>
  `update games set ${column} = 0, turn_started_at = ? where id = ? and status = 'active'`;
const FINISH_SQL = (column: "clock_ms_1" | "clock_ms_2") => `
  update games set status = 'finished', winner_seat = ?, end_reason = 'points', finished_at = ?, ${column} = 0
  where id = ? and status = 'active'
  returning id`;
const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

const column = (seat: Seat) => (seat === 1 ? "clock_ms_1" : "clock_ms_2") as "clock_ms_1" | "clock_ms_2";
const other = (seat: Seat): Seat => (seat === 1 ? 2 : 1);

export type PaperSettlement = { finished: boolean; changed: boolean };

/**
 * Lazy timeline of the paper game (E11, BR-50): the end by time, the automat's take-over and its
 * stones are computed when somebody touches the game, under the row lock of `games`, with the
 * injected clock and random numbers. Nothing runs in the background.
 */
export class PaperSettler {
  readonly #clock: Clock;
  readonly #random: () => number;

  constructor({ clock, random }: Deps) {
    this.#clock = clock;
    this.#random = random;
  }

  /**
   * Without a lock: whether something is due at `now` (the player's deadline or the automat's
   * pending stone), so a poll of a running game stays a plain read.
   */
  async isDue(gameId: string, tx: EntityManager, now: Date = this.#clock.now()): Promise<boolean> {
    const [row] = await tx.execute<GameRow[]>(GAME_SQL, [gameId]);
    if (!row || row.status !== "active" || row.black_seat === null || row.turn_started_ms === null) return false;
    const seat = this.#clockSeat(row);
    const deadline = deadlineMs({
      clockMs: [row.clock_ms_1, row.clock_ms_2],
      turnStartedAtMs: Math.floor(Number(row.turn_started_ms)),
      turnSeat: seat,
    })!;
    const pending = row.pending_ms === null ? Infinity : Number(row.pending_ms);
    return now.getTime() >= Math.min(deadline, pending);
  }

  /** Settles a game whose row the caller has locked, at `now`. */
  async settle(gameId: string, tx: EntityManager, now: Date = this.#clock.now()): Promise<PaperSettlement> {
    const none = { finished: false, changed: false };
    const [row] = await tx.execute<GameRow[]>(GAME_SQL, [gameId]);
    if (!row || row.status !== "active" || row.black_seat === null || row.turn_started_ms === null) return none;
    const snapshot = (await loadPaperSnapshot(tx, gameId))!;
    const state: PaperClockState = {
      stones: stonesOf(snapshot.moves),
      clockMs: [row.clock_ms_1, row.clock_ms_2],
      turnSeat: this.#clockSeat(row),
      turnStartedAtMs: Math.floor(Number(row.turn_started_ms)),
      autoSeat: snapshot.autoSeat,
      pendingAutoAtMs: snapshot.pendingAutoAtMs,
    };
    const resolved = resolvePaperClock(state, now.getTime(), this.#random);
    if (resolved.autoMoves.length === 0 && resolved.finish === null) return none;

    for (const [index, move] of resolved.autoMoves.entries()) {
      await tx.execute(
        INSERT_MOVE_SQL,
        [gameId, snapshot.moveCount + 1 + index, move.x, move.y, move.seat, new Date(move.atMs)],
        "run",
      );
    }
    // Whatever is written leaves no stone pending: a take-over has none yet, a due one was just played.
    const stones = resolved.state.stones;
    const { scores } = scoreGame(stones);
    const moveCount = snapshot.moveCount + resolved.autoMoves.length;
    const lastAt = resolved.autoMoves.at(-1)?.atMs;
    await tx.execute(
      UPDATE_STATE_SQL,
      [
        moveCount,
        scores[0],
        scores[1],
        resolved.state.autoSeat,
        lastAt === undefined ? null : new Date(lastAt),
        gameId,
      ],
      "run",
    );
    // The automat took over in this call: its clock is spent, the player's runs from that moment.
    if (state.autoSeat === null && resolved.state.autoSeat !== null) {
      await tx.execute(
        TAKE_OVER_SQL(column(resolved.state.autoSeat)),
        [new Date(resolved.state.turnStartedAtMs), gameId],
        "run",
      );
    }
    if (resolved.finish === null) return { finished: false, changed: true };

    const winner = resolved.finish.winnerSeat;
    const written = await tx.execute<{ id: string }[]>(FINISH_SQL(column(resolved.state.turnSeat)), [
      winner,
      new Date(resolved.finish.atMs),
      gameId,
    ]);
    if (written.length === 0) return { finished: false, changed: true };
    await recordFinishedGame(tx, gameId);
    await tx.execute(RELEASE_SLOTS_SQL, [gameId], "run");
    return { finished: true, changed: true };
  }

  // The seat whose clock runs: the opponent of the automat in its phase, otherwise the one on turn.
  #clockSeat(row: GameRow): Seat {
    if (row.auto_seat !== null) return other(row.auto_seat as Seat);
    return seatOnTurn(row.move_count, row.black_seat as Seat);
  }
}
