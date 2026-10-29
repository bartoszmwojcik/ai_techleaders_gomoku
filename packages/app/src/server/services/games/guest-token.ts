/**
 * A guest token is valid while the game is in progress and for one hour after it finished
 * (BR-22, #21 Q10); a cancelled game (never opened, Q21) voids it. Expects the alias `g` for
 * `games` and one bound parameter: the cutoff `now - GUEST_TOKEN_GRACE_MS`.
 */
export const GUEST_TOKEN_VALID_SQL = `(g.status = 'active' or (g.status = 'finished' and g.finished_at > ?))`;
