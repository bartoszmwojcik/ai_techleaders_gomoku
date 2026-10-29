import { READY_DEADLINE_MS } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

/** SQL of the lazy closing of games (#21 Q16, Q21), shared by `GameService` and `InvitationService`. */

// Frees the slots of waiting games whose invitation expired (#21 Q16). One statement, in the
// lock order games -> game_players. `?` binds: now, then the user (or game) id.
function expireWaitingSql(scope: string): string {
  return `
  with expired as (
    update games g set status = 'cancelled'
    where g.status = 'waiting'
      and exists (select 1 from invitations i where i.game_id = g.id and i.expires_at <= ?)
      and ${scope}
    returning g.id
  )
  update game_players set is_active = false
  where is_active and game_id in (select id from expired)`;
}

// Cancels `active` games in which somebody never opened the page within READY_DEADLINE_MS of
// the start (#21 Q21). `?` binds: the cutoff (now - deadline), then the user (or game) id.
function cancelNotStartedSql(scope: string): string {
  return `
  with stale as (
    update games g set status = 'cancelled'
    where g.status = 'active'
      and g.started_at <= ?
      and exists (select 1 from game_players p where p.game_id = g.id and p.seen_at is null)
      and ${scope}
    returning g.id
  )
  update game_players set is_active = false
  where is_active and game_id in (select id from stale)`;
}

const OF_USER = `exists (select 1 from game_players m where m.game_id = g.id and m.user_id = ?)`;
const OF_GAME = `g.id = ?`;
const OF_GUEST = `exists (select 1 from game_players m where m.game_id = g.id and m.guest_token_hash = ?)`;

export const EXPIRE_WAITING_OF_USER = expireWaitingSql(OF_USER);
export const EXPIRE_WAITING_OF_GAME = expireWaitingSql(OF_GAME);
export const CANCEL_NOT_STARTED_OF_USER = cancelNotStartedSql(OF_USER);
export const CANCEL_NOT_STARTED_OF_GAME = cancelNotStartedSql(OF_GAME);

export const CANCEL_NOT_STARTED_OF_GUEST = cancelNotStartedSql(OF_GUEST);

/**
 * Closes the stale slots of an account (#21 Q16, Q21): its waiting games whose invitation
 * expired and its active games nobody opened within READY_DEADLINE_MS. Two idempotent single
 * statements in the lock order games -> game_players; pass the `tx` when inside a transaction.
 */
export async function closeStaleSlotsOfUser(
  em: Pick<EntityManager, "execute">,
  userId: string,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - READY_DEADLINE_MS);
  await em.execute(EXPIRE_WAITING_OF_USER, [now, userId], "run");
  await em.execute(CANCEL_NOT_STARTED_OF_USER, [cutoff, userId], "run");
}
