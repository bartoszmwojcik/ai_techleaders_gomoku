/** Invitation validity (#21 Q3): a friend may answer after a few hours. */
export const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

/** A guest token keeps working this long after the game finished (BR-22, #21 Q10). */
export const GUEST_TOKEN_GRACE_MS = 60 * 60 * 1000;

/**
 * Time both players get to open the game page after joining (#21 Q21); after it a game
 * where someone has no `seen_at` is cancelled lazily.
 */
export const READY_DEADLINE_MS = 15 * 60 * 1000;

/** Games one user may create per hour (#21 Q13); guards against a create/cancel loop. */
export const CREATE_GAME_LIMIT = 10;
export const CREATE_GAME_WINDOW_MS = 60 * 60 * 1000;

/** Each player's clock budget (#23, BR-04). */
export const INITIAL_CLOCK_MS = 10 * 60 * 1000;

/**
 * Invitation alphabet (#21 Q2): digits and letters without the look-alikes `0 O 1 I L`.
 * 8 digits + 23 letters = 31 symbols, so a code carries 31^8 (~39.6 bits) of entropy.
 */
export const INVITATION_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const INVITATION_CODE_LENGTH = 8;
