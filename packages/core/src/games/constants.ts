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

/**
 * Failed invitation-code lookups (#21 Q13), `accept` and the invite page share one pool:
 * 20 per client address in 15 minutes; when the address cannot be trusted a global pool
 * of 300 applies instead, and once it is spent every lookup is refused until the window ends.
 */
export const INVITATION_LOOKUP_LIMIT = 20;
export const INVITATION_LOOKUP_GLOBAL_LIMIT = 300;
export const INVITATION_LOOKUP_WINDOW_MS = 15 * 60 * 1000;

/** A rematch offer stays open this long (rematch spec, Q2). */
export const REMATCH_TTL_MS = 5 * 60 * 1000;

/** Rematch offers one player may make per hour (rematch spec, Q7). */
export const REMATCH_OFFER_LIMIT = 10;
export const REMATCH_OFFER_WINDOW_MS = 60 * 60 * 1000;

/**
 * Limits of the MCP endpoint for agents (E06-S01, D-29, decision #138). Initial values without
 * data (A-04, A-06): the app lets the environment override them (`MCP_*`, see `ServerConfig`).
 */
/** Requests per client address per minute, every tool included. */
export const MCP_REQUEST_LIMIT = 300;
export const MCP_REQUEST_WINDOW_MS = 60 * 1000;
/** Successful joins of an agent per client address per hour (the value of `CREATE_GAME_LIMIT`). */
export const MCP_JOIN_LIMIT = CREATE_GAME_LIMIT;
export const MCP_JOIN_WINDOW_MS = CREATE_GAME_WINDOW_MS;
/**
 * Failed invitation codes of agents: a pool of its own, so an automatic client cannot use up the
 * pool of a human behind the same address (`INVITATION_LOOKUP_*`). Same values and window.
 */
export const AGENT_LOOKUP_LIMIT = INVITATION_LOOKUP_LIMIT;
export const AGENT_LOOKUP_GLOBAL_LIMIT = INVITATION_LOOKUP_GLOBAL_LIMIT;
/** Largest body of an MCP request, in bytes. */
export const MCP_BODY_MAX_BYTES = 8 * 1024;
/** Longest `code` argument of `join`: a code or a link to the invitation page. */
export const AGENT_CODE_MAX_LENGTH = 64;
