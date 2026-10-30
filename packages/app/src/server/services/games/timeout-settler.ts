import { deadlineMs, seatOnTurn, seatOutOfTime, type ClockState, type Seat } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { Clock } from "../email/email-sender";

/**
 * Lazy "lost on time" settlement of #23 (Q3): nothing runs in the background, a game whose
 * clock ran out is finished by whoever touches it next.
 *
 * Lock order is users, then games, then game_players (#22 Risks); the methods below never
 * lock a row out of that order.
 */
export interface TimeoutSettler {
  /**
   * Finishes the user's `active` games whose clock ran out, so that BR-13 checks see a free
   * slot (#21 Q17). Locks the user, then the games.
   */
  settleFor(userId: string): Promise<void>;
  /**
   * The same for a guest browser (E02-S08), found by the hash of its token: finishes the
   * running games the token holds before BR-13 is checked. No user to lock; each game is locked
   * by `settleExpired`.
   */
  settleForGuest(tokenHash: string): Promise<void>;
  /**
   * Finishes one game whose row the caller has already locked, by the time `now` (default:
   * the clock now). Writes only through `tx` and never locks `users`.
   * @returns whether the game was finished by running out of time
   */
  settleGame(gameId: string, tx: EntityManager, now?: Date): Promise<boolean>;
  /**
   * For readers that hold no lock: looks at the game without one and only when its time is up
   * takes the row lock and settles (a poll of a running game stays a plain read).
   * @returns whether the game was finished by running out of time
   */
  settleExpired(gameId: string, tx: EntityManager, now?: Date): Promise<boolean>;
}

type Snapshot = {
  status: string;
  black_seat: number | null;
  move_count: number;
  clock_ms_1: number;
  clock_ms_2: number;
  /** `turn_started_at` in epoch milliseconds, computed in SQL (dates come back as text). */
  turn_started_ms: number | null;
};

const SNAPSHOT_SQL = `
  select status, black_seat, move_count, clock_ms_1, clock_ms_2,
    (extract(epoch from turn_started_at) * 1000)::float8 as turn_started_ms
  from games where id = ?`;

const LOCK_GAME_SQL = `select id from games where id = ? for update`;
const LOCK_USER_SQL = `select id from users where id = ? for no key update`;

// Candidates for `settleFor`: games of the user that are running (the clock has started).
const RUNNING_GAMES_OF_USER_SQL = `
  select g.id from games g join game_players p on p.game_id = g.id
  where p.user_id = ? and p.is_active and g.status = 'active' and g.turn_started_at is not null
  order by g.id`;

const RUNNING_GAMES_OF_GUEST_SQL = `
  select g.id from games g join game_players p on p.game_id = g.id
  where p.guest_token_hash = ? and p.is_active and g.status = 'active' and g.turn_started_at is not null
  order by g.id`;

// One conditional update: of two settlers (or a settler and a move) exactly one writes. The
// loser of the game ends with an empty clock (#23 invariants).
const finishSql = (clockColumn: "clock_ms_1" | "clock_ms_2") => `
  update games set status = 'finished', winner_seat = ?, end_reason = 'timeout',
    finished_at = ?, ${clockColumn} = 0
  where id = ? and status = 'active' and move_count = ?
  returning id`;
const FINISH_SQL = { 1: finishSql("clock_ms_1"), 2: finishSql("clock_ms_2") } as const;

const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

type Deps = { em: EntityManager; clock: Clock };

export class SqlTimeoutSettler implements TimeoutSettler {
  readonly #em: EntityManager;
  readonly #clock: Clock;

  constructor({ em, clock }: Deps) {
    this.#em = em;
    this.#clock = clock;
  }

  async settleFor(userId: string): Promise<void> {
    const candidates = await this.#em.execute<{ id: string }[]>(RUNNING_GAMES_OF_USER_SQL, [userId]);
    if (candidates.length === 0) return;
    const now = this.#clock.now();
    await this.#em.transactional(async (tx) => {
      await tx.execute(LOCK_USER_SQL, [userId], "run");
      for (const { id } of candidates) await this.settleExpired(id, tx, now);
    });
  }

  async settleForGuest(tokenHash: string): Promise<void> {
    const candidates = await this.#em.execute<{ id: string }[]>(RUNNING_GAMES_OF_GUEST_SQL, [
      tokenHash,
    ]);
    if (candidates.length === 0) return;
    const now = this.#clock.now();
    await this.#em.transactional(async (tx) => {
      for (const { id } of candidates) await this.settleExpired(id, tx, now);
    });
  }

  async settleExpired(
    gameId: string,
    tx: EntityManager,
    now: Date = this.#clock.now(),
  ): Promise<boolean> {
    const snapshot = await this.#loserOf(gameId, tx, now);
    if (!snapshot) return false;
    await tx.execute(LOCK_GAME_SQL, [gameId], "run");
    return this.settleGame(gameId, tx, now);
  }

  async settleGame(
    gameId: string,
    tx: EntityManager,
    now: Date = this.#clock.now(),
  ): Promise<boolean> {
    const found = await this.#loserOf(gameId, tx, now);
    if (!found) return false;
    const written = await tx.execute<{ id: string }[]>(FINISH_SQL[found.loser], [
      found.loser === 1 ? 2 : 1,
      new Date(found.deadlineMs),
      gameId,
      found.moveCount,
    ]);
    if (written.length === 0) return false;
    await tx.execute(RELEASE_SLOTS_SQL, [gameId], "run");
    return true;
  }

  // The seat that is out of time at `now` in the game as it is now, or `null`.
  async #loserOf(
    gameId: string,
    tx: EntityManager,
    now: Date,
  ): Promise<{ loser: Seat; deadlineMs: number; moveCount: number } | null> {
    const [row] = await tx.execute<Snapshot[]>(SNAPSHOT_SQL, [gameId]);
    if (!row || row.status !== "active" || row.black_seat === null) return null;
    if (row.turn_started_ms === null) return null;
    const state: ClockState = {
      clockMs: [row.clock_ms_1, row.clock_ms_2],
      turnStartedAtMs: Math.floor(Number(row.turn_started_ms)),
      turnSeat: seatOnTurn(row.move_count, row.black_seat as Seat),
    };
    const loser = seatOutOfTime(state, now.getTime());
    if (loser === null) return null;
    return {
      loser,
      deadlineMs: deadlineMs(state)!,
      moveCount: row.move_count,
    };
  }
}
