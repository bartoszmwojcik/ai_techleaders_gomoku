// Cleanup rules (spec 2026-10-24-expired-records-cleanup, Q2/Q4). Every entity with an
// `expiresAt` column needs a rule here or an entry in `CLEANUP_EXEMPT_TABLES` (guard test).
// Each new expiring table adds its rule together with its entity.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The longest rate-limit window the application uses: the daily e-mail pools
 * (`email-daily:verification`, `email-daily:reset`, `DAILY_WINDOW_MS` in the app). A test in the
 * app checks that no window is longer; the counters rule keeps a margin on top of it.
 */
export const LONGEST_RATE_LIMIT_WINDOW_MS = 24 * HOUR_MS;

export type CleanupRule = {
  /** Key of the result object returned by `cleanupExpired`. */
  readonly key:
    | "sessions"
    | "rateLimitBuckets"
    | "emailVerificationTokens"
    | "passwordResetTokens"
    | "waitingGames"
    | "cancelledGames"
    | "guestTokens"
    | "unverifiedUsers";
  readonly table: string;
  readonly primaryKey: string;
  /** SQL condition over the table's columns; each `?` is bound to the cutoff timestamp. Static text only. */
  readonly condition: string;
  /**
   * Instead of deleting the matching rows, sets this column to `NULL` (the condition must stop
   * matching once it is cleared, or the rule never ends). Static identifier.
   */
  readonly clearColumn?: string;
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
  {
    // An unjoined game whose invitation expired: kept for 1 h after the expiry, because the guest
    // creator's token works that long and shows "invitation expired" (E02-S08, L29). The rows of
    // players and the invitation go with the game (`on delete cascade`).
    key: "waitingGames",
    table: "games",
    primaryKey: "id",
    condition:
      "status = 'waiting' and exists (select 1 from invitations i where i.game_id = games.id and i.expires_at < ?)",
    graceMs: HOUR_MS,
  },
  {
    // Cancelled games (by the creator, expired unjoined or never opened) older than 24 h. The extra
    // 1 h keeps an expired unjoined game (invitation expires 24 h after creation) for the same
    // window as `waitingGames` above.
    key: "cancelledGames",
    table: "games",
    primaryKey: "id",
    condition: "status = 'cancelled' and created_at < ?",
    graceMs: 25 * HOUR_MS,
  },
  {
    // A guest token stops working 1 h after the game finished (BR-22); the hash is not needed after that.
    key: "guestTokens",
    table: "game_players",
    primaryKey: "id",
    clearColumn: "guest_token_hash",
    condition:
      "guest_token_hash is not null and game_id in (select id from games where finished_at < ?)",
    graceMs: HOUR_MS,
  },
  {
    // BR-28: an account that never confirmed its e-mail and took part in no game for 14 days.
    // `not exists` over `game_players` keeps an account with any game, also a cancelled one, until
    // the game rules above delete that game (so the account goes at the earliest in the run after
    // the game did). The sessions and tokens of the user go with it (`on delete cascade`).
    // Last in the list on purpose: the games of the same run are already swept.
    key: "unverifiedUsers",
    table: "users",
    primaryKey: "id",
    condition:
      "email_verified_at is null and created_at < ? and not exists (select 1 from game_players gp where gp.user_id = users.id)",
    graceMs: 14 * DAY_MS,
  },
];

/**
 * Tables with an `expiresAt` column that are deliberately not swept by their own rule.
 * `invitations` go away with their game (`on delete cascade`, see the `waitingGames` and
 * `cancelledGames` rules).
 */
export const CLEANUP_EXEMPT_TABLES: readonly string[] = ["invitations"];
