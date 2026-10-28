// Cleanup rules (spec 2026-10-24-expired-records-cleanup, Q2/Q4). Every entity with an
// `expiresAt` column needs a rule here or an entry in `CLEANUP_EXEMPT_TABLES` (guard test).
// Each new expiring table adds its rule together with its entity.

const HOUR_MS = 60 * 60 * 1000;

/**
 * The longest rate-limit window the application uses: the daily e-mail pools
 * (`email-daily:verification`, `email-daily:reset`, `DAILY_WINDOW_MS` in the app). A test in the
 * app checks that no window is longer; the counters rule keeps a margin on top of it.
 */
export const LONGEST_RATE_LIMIT_WINDOW_MS = 24 * HOUR_MS;

export type CleanupRule = {
  /** Key of the result object returned by `cleanupExpired`. */
  readonly key: "sessions" | "rateLimitBuckets" | "emailVerificationTokens" | "passwordResetTokens";
  readonly table: string;
  readonly primaryKey: string;
  /** SQL condition over the table's columns; each `?` is bound to the cutoff timestamp. Static text only. */
  readonly condition: string;
  /** Only an optional rule treats a missing table (42P01) as "nothing to do" (`null`); otherwise it is an error. */
  readonly optional?: boolean;
  /** Rows matching the condition for cutoff = `now - graceMs` are deleted. */
  readonly graceMs: number;
};

export const CLEANUP_RULES: readonly CleanupRule[] = [
  {
    // 1 h margin: a session that expired mid-game stays until the game ends (G5, games last <= ~20 min).
    key: "sessions",
    table: "sessions",
    primaryKey: "id",
    condition: "expires_at < ?",
    graceMs: HOUR_MS,
  },
  {
    // The longest window is 24 h (`email-daily:*` pools). The limiter measures time with the database
    // clock and the cleanup with the Node clock, so a bucket is kept 24 h past the end of the longest
    // window (48 h in total): clock skew between the two can never reset a pool that is still counting.
    key: "rateLimitBuckets",
    table: "rate_limit_buckets",
    primaryKey: "key",
    condition: "window_start < ?",
    graceMs: LONGEST_RATE_LIMIT_WINDOW_MS + 24 * HOUR_MS,
  },
  {
    key: "emailVerificationTokens",
    table: "email_verification_tokens",
    primaryKey: "id",
    condition: "expires_at < ? or used_at < ?",
    graceMs: 24 * HOUR_MS,
  },
  {
    key: "passwordResetTokens",
    table: "password_reset_tokens",
    primaryKey: "id",
    condition: "expires_at < ? or used_at < ?",
    graceMs: 24 * HOUR_MS,
  },
];

/** Tables with an `expiresAt` column that are deliberately not swept (none yet). */
export const CLEANUP_EXEMPT_TABLES: readonly string[] = [];
