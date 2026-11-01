import { GUEST_TOKEN_GRACE_MS } from "../games/constants";

/** Product limit of a message in code points after NFKC (BR-32); `CHAT_MAX_LENGTH` in the environment overrides it. */
export const CHAT_MAX_LENGTH = 200;
/** Technical ceiling of a message in the database and of every configured limit (CHECK `char_length` 1-1000). */
export const CHAT_HARD_MAX_LENGTH = 1000;
/** Raw input above this many UTF-16 units is refused before NFKC, which can expand a character (U+FDFA). */
export const CHAT_RAW_MAX_UNITS = 1000;
/** Minimum time between two messages of one participant (BR-32). */
export const CHAT_MIN_INTERVAL_MS = 2000;
/** Messages in one game; the next one is `CHAT_FULL` (R6). */
export const CHAT_MAX_MESSAGES_PER_GAME = 500;
/** Messages returned by the first read and by a read without `limit` (R16). */
export const CHAT_PAGE_SIZE = 50;
/** The most messages one read returns. */
export const CHAT_MAX_PAGE_SIZE = 100;
/** The chat stays readable and writable this long after the game finished (BR-34), like a guest token. */
export const CHAT_RETENTION_MS = GUEST_TOKEN_GRACE_MS;
/** Combining marks in a row beyond which a message is "zalgo" (R8). */
export const CHAT_MAX_COMBINING_RUN = 4;

/**
 * Endings of an internet address that make a word a link (R10). A short list on purpose: a
 * heuristic against pasted links, not moderation; "Dobra.Gramy" is a sentence, "ok.com" is not.
 */
export const CHAT_BLOCKED_TLDS = [
  "com", "net", "org", "info", "biz", "xyz", "io", "gg", "ly", "cc", "co", "tv", "ws", "ai",
  "app", "dev", "link", "site", "online", "shop", "top", "club",
  "pl", "eu", "de", "uk", "ru", "cz", "sk", "fr", "es", "nl",
] as const;
