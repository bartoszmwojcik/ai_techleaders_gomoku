// Cleanup rules (spec 2026-10-24-expired-records-cleanup, Q2/Q4). Every entity with an
// `expiresAt` column needs a rule here or an entry in `CLEANUP_EXEMPT_TABLES` (guard test).
// Each new expiring table adds its rule together with its entity.

import { CHAT_RETENTION_MS, GUEST_TOKEN_GRACE_MS, READY_DEADLINE_MS } from "@gomoku/core";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Games with no participant of another kind than `guest` and `agent` (BR-24, BR-29, BR-31): without
 * an account nobody has a history of the game, so a guest-agent game goes like a guest-guest one.
 * `kind`, not `user_id IS NULL`: a deleted account (#37) has `user_id = NULL` but stays
 * `kind = 'account'`, so its opponent's history is protected. Static text only.
 */
const GUEST_ONLY_SQL =
  "not exists (select 1 from game_players p where p.game_id = games.id and p.kind not in ('guest', 'agent'))";

/**
 * Moment the game's clock runs out, as `deadlineMs`/`seatOnTurn` of `@gomoku/core` compute it
 * (black moves at an even `move_count`): `turn_started_at` plus the stored time of the seat on
 * turn, or, while the clock never started, the ready deadline after `started_at`
 * (the same term as `CANCEL_NOT_STARTED`). Static text only (the constant is a number).
 */
const GAME_DEADLINE_SQL = `coalesce(
  turn_started_at + (case when (case when move_count % 2 = 0 then black_seat else 3 - black_seat end) = 1
                          then clock_ms_1 else clock_ms_2 end) * interval '1 millisecond',
  started_at + ${READY_DEADLINE_MS} * interval '1 millisecond'
)`;

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
    | "lobbySeekers"
    | "chatMessages"
    | "waitingGames"
    | "cancelledGames"
    | "guestOnlyActiveGames"
    | "guestOnlyFinishedGames"
    | "guestTokens"
    | "agentTokens"
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
    // "Looking for a game" statuses (#25) live 5 minutes (BR-12) and reads filter on `expires_at`, so a
    // dead row never matters for correctness; the 1 h margin only absorbs clock skew between Node and the database.
    key: "lobbySeekers",
    table: "lobby_seekers",
    primaryKey: "id",
    condition: "expires_at < ?",
    graceMs: HOUR_MS,
  },
  {
    // BR-34: the chat vanishes about 1 h after the game, also when the game stays as an account's
    // history (the game rules below never touch such a game). `exists` over the small, short-lived
    // `chat_messages` instead of `game_id in (select ... from games)`: the run scans the messages of
    // the last hours and probes `games` by primary key, not the ever-growing history. The columns of
    // `GAME_DEADLINE_SQL` are unqualified and resolve to `g`, the only source holding them. Three `?`
    // (one per branch, the same cutoff). Stands before every rule deleting from `games`: short
    // batches here instead of a heavy cascade inside a game batch.
    key: "chatMessages",
    table: "chat_messages",
    primaryKey: "id",
    condition: `exists (select 1 from games g where g.id = chat_messages.game_id and (
      (g.status = 'finished' and g.finished_at < ?)
      or (g.status = 'cancelled' and g.created_at < ?)
      or (g.status = 'active' and ${GAME_DEADLINE_SQL} < ?)))`,
    graceMs: CHAT_RETENTION_MS,
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
    // A dead game of guests only (no account, so no history, BR-24): the clock of the player on
    // turn ran out (or the clock never started within the ready deadline) more than 1 h ago.
    // Not settled here (the result stays unwritten, Q4): the 1 h is the guest token window, so a
    // returning player can still open the game and see the lazy "lost on time". Rows of players
    // and the invitation go with the game (`on delete cascade`).
    key: "guestOnlyActiveGames",
    table: "games",
    primaryKey: "id",
    condition: `status = 'active' and ${GUEST_ONLY_SQL} and ${GAME_DEADLINE_SQL} < ?`,
    graceMs: GUEST_TOKEN_GRACE_MS,
  },
  {
    // A finished game of guests only, 1 h after the end (the token window). Stands before
    // `guestTokens` only to spare it an `UPDATE` on rows that vanish in the same run.
    key: "guestOnlyFinishedGames",
    table: "games",
    primaryKey: "id",
    condition: `status = 'finished' and ${GUEST_ONLY_SQL} and finished_at < ?`,
    graceMs: GUEST_TOKEN_GRACE_MS,
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
    // The same for an agent's token (E06-S01): it stops working 1 h after the game finished, like a
    // guest's. The row of a game with an account stays (its history), only the hash goes.
    key: "agentTokens",
    table: "game_players",
    primaryKey: "id",
    clearColumn: "agent_token_hash",
    condition:
      "agent_token_hash is not null and game_id in (select id from games where finished_at < ?)",
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
