/**
 * Removes the "looking for a game" status of the given users (#25 Q5). Run inside the
 * transaction that puts them in a game, right after their `users` rows are locked, so a status
 * never outlives the slot. `?` binds one user id per placeholder.
 */
export const deleteSeekersSql = (count: number): string =>
  `delete from lobby_seekers where user_id in (${Array.from({ length: count }, () => "?").join(", ")})`;

/** The status of whoever owns the session behind a token hash (logout, #25 Q6). */
export const DELETE_SEEKER_OF_SESSION_SQL = `
  delete from lobby_seekers
  where user_id in (select user_id from sessions where token_hash = ?)`;
