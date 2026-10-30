/**
 * A guest token is valid while the game is in progress, for one hour after it finished (BR-22,
 * #21 Q10) and for a game that was never played: a `waiting` game and one that expired unjoined
 * (`cancelled` with an unconsumed invitation) count until one hour after the invitation expired
 * (E02-S08, L29), so a guest creator sees "invitation expired" instead of `404`. A game closed
 * unplayed after a join (Q21) or cancelled by its creator (`consumed_at` set) voids the token.
 * Expects the alias `g` for `games` and one bound parameter: the cutoff
 * `now - GUEST_TOKEN_GRACE_MS`.
 */
export const GUEST_TOKEN_VALID_SQL = `(g.status = 'active' or (g.status in ('finished', 'waiting', 'cancelled') and (case when g.status = 'finished' then g.finished_at else (select max(i.expires_at) from invitations i where i.game_id = g.id and i.consumed_at is null) end) > ?))`;
