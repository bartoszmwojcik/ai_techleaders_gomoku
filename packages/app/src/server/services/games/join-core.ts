import { GoneError, INVITATION_LOOKUP_WINDOW_MS, type Seat } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { RateLimiter } from "../rate-limit/rate-limiter";

/**
 * The part of joining a game that does not depend on who joins (#21 step 4, E06-S01): the lookup
 * SQL of an invitation, the row locks, and the atomic "consume the invitation, seat the player,
 * start the game". `InvitationService` (a browser: an account or a guest) and `AgentSeatService`
 * (an agent over MCP) differ only in the checks before it and the row they insert.
 */

export const INVALID_INVITATION_MESSAGE = "To zaproszenie jest już nieważne.";

/** One uniform answer for an unknown, used, expired, cancelled or malformed code (no oracle). */
export function invalidInvitation(): GoneError {
  return new GoneError(INVALID_INVITATION_MESSAGE, { code: "INVALID_INVITATION" });
}

/** Name of the unique index `(game_id, seat)`: the last line of defence against a third player. */
export const SEAT_CONSTRAINT = "game_players_game_id_seat_unique";

export type InvitationRow = {
  id: string;
  game_id: string;
  /** Only compared with null: raw `em.execute` returns timestamps as strings, not `Date`s. */
  consumed_at: string | null;
  /** Computed in SQL: raw `em.execute` returns timestamps as strings, not `Date`s. */
  expired: boolean;
  status: string;
  creator_id: string | null;
  creator_name: string | null;
  creator_kind: string;
  creator_nickname: string | null;
};

export const READ_INVITATION_SQL = `
  select i.id, i.game_id, i.consumed_at, i.expires_at <= ? as expired, g.status,
    c.user_id as creator_id, u.display_name as creator_name,
    c.kind as creator_kind, c.nickname as creator_nickname
  from invitations i
  join games g on g.id = i.game_id
  join game_players c on c.game_id = g.id and c.seat = 1
  left join users u on u.id = c.user_id
  where i.code = ?`;

// The conditional updates below are what makes the join atomic: of two concurrent accepts,
// one consumes the invitation, the other sees 0 rows.
const CONSUME_INVITATION_SQL = `
  update invitations set consumed_at = ?
  where code = ? and consumed_at is null and expires_at > ?
  returning id`;

const SET_CONSUMED_BY_SQL = `update invitations set consumed_by_id = ? where id = ?`;

const START_GAME_SQL = `
  update games set status = 'active', started_at = ?, black_seat = ?
  where id = ? and status = 'waiting'
  returning id`;

const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");

// Row locks in a fixed order (users by id, then games by id) so concurrent joins, cancels and
// the account deletion (#37) cannot deadlock. `for no key update` does not block the foreign
// key checks of unrelated inserts (sessions, game_players) that reference the same user.
const lockUsersSql = (count: number) =>
  `select id from users where id in (${placeholders(count)}) order by id for no key update`;
const lockGamesSql = (count: number) =>
  `select id from games where id in (${placeholders(count)}) order by id for update`;

/** Locks the given users (none for a game of guests only), then the given games. */
export async function lockForJoin(
  tx: EntityManager,
  userIds: readonly string[],
  gameIds: readonly string[],
): Promise<void> {
  if (userIds.length > 0) await tx.execute(lockUsersSql(userIds.length), [...userIds], "run");
  await tx.execute(lockGamesSql(gameIds.length), [...gameIds], "run");
}

/**
 * Consumes the invitation, inserts the joiner (`insert`: the statement and its parameters, a
 * row for seat 2 that returns its `id`) and starts the game; each step is conditional, any miss
 * is the uniform `INVALID_INVITATION` and the caller's transaction rolls everything back.
 * The joiner has just opened the page (`seen_at` is set by `insert`), so only the creator's
 * visit is awaited (Q20). `drawBlackSeat` is called once the player is seated.
 */
export async function seatSecondPlayer(
  tx: EntityManager,
  join: {
    code: string;
    invitationId: string;
    gameId: string;
    now: Date;
    insert: { sql: string; params: unknown[] };
    drawBlackSeat: () => Seat;
  },
): Promise<void> {
  const { code, invitationId, gameId, now, insert, drawBlackSeat } = join;
  const consumed = await tx.execute<{ id: string }[]>(CONSUME_INVITATION_SQL, [now, code, now]);
  if (consumed.length === 0) throw invalidInvitation();
  const [player] = await tx.execute<{ id: string }[]>(insert.sql, insert.params);
  await tx.execute(SET_CONSUMED_BY_SQL, [player!.id, invitationId], "run");
  const started = await tx.execute<{ id: string }[]>(START_GAME_SQL, [now, drawBlackSeat(), gameId]);
  if (started.length === 0) throw invalidInvitation();
}

/**
 * Which pool counts the failed code lookups: the client address (20 per 15 minutes) or, when
 * the address is not trustworthy, one global pool (300 per 15 minutes) (#21 Q13). Browsers and
 * agents have pools of their own (`invitation-lookup:*`, `agent-lookup:*`).
 */
export type LookupGuard = { key: string; limit: number };

/**
 * Q13, race-free: one attempt is reserved in the pool BEFORE the lookup (an atomic upsert in
 * its own committed transaction, so concurrent guesses cannot all read "below the limit").
 * It is given back unless the lookup failed with the uniform `INVALID_INVITATION`, so the
 * pool only counts failures; once spent, even a correct code gets 429 (no oracle).
 * Giving the attempt back is best-effort: a failing `release` must neither turn a finished
 * lookup into a 500 nor mask the original error (fail-closed: the counter just stays high).
 * A release after the window rolled over lowers the NEW window's counter: one free attempt
 * per window boundary, accepted.
 */
export async function withLookupAttempt<T>(
  rateLimiter: Pick<RateLimiter, "hit" | "release">,
  guard: LookupGuard,
  lookup: () => Promise<T>,
): Promise<T> {
  await rateLimiter.hit(guard.key, guard.limit, INVITATION_LOOKUP_WINDOW_MS);
  const release = () =>
    rateLimiter.release(guard.key, INVITATION_LOOKUP_WINDOW_MS).catch(() => undefined);
  let result: T;
  try {
    result = await lookup();
  } catch (error) {
    if (!(error instanceof GoneError)) await release();
    throw error;
  }
  await release();
  return result;
}
