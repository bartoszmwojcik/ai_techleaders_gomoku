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

export const EXPIRE_WAITING_OF_USER = expireWaitingSql(OF_USER);
export const EXPIRE_WAITING_OF_GAME = expireWaitingSql(OF_GAME);
export const CANCEL_NOT_STARTED_OF_USER = cancelNotStartedSql(OF_USER);
export const CANCEL_NOT_STARTED_OF_GAME = cancelNotStartedSql(OF_GAME);

