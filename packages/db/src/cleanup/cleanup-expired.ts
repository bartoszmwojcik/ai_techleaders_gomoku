import type { EntityManager } from "@mikro-orm/postgresql";

import { CLEANUP_RULES, type CleanupRule } from "./rules";

export const DEFAULT_BATCH_SIZE = 1000;
export const DEFAULT_TIME_LIMIT_MS = 60_000;

const UNDEFINED_TABLE = "42P01";

/** Deleted rows per rule; `null` = table absent (or rule unavailable). */
export type CleanupResult = {
  sessions: number | null;
  rateLimitBuckets: number | null;
  emailVerificationTokens: number | null;
  passwordResetTokens: number | null;
  /** Always `null` until the game participants table (#29) exists (BR-28). */
  unverifiedUsers: number | null;
};

export type CleanupOptions = {
  em: Pick<EntityManager, "execute">;
  now: Date;
  batchSize?: number;
  /** Stop starting new batches at this instant (default: now + 60 s). */
  deadline?: Date;
  /** Current time source for the deadline check. */
  clock?: () => number;
};

// Identifiers come from the static rules, never from callers; values are bound parameters.
function batchSql({ table, primaryKey, condition }: CleanupRule): string {
  return `delete from ${table} where ${primaryKey} in (select ${primaryKey} from ${table} where ${condition} limit $2 for update skip locked)`;
}

/**
 * Deletes expired/used rows in short batches (one autocommit statement each) until a rule is
 * exhausted or the deadline passes; the remainder is left for the next run.
 */
export async function cleanupExpired({
  em,
  now,
  batchSize = DEFAULT_BATCH_SIZE,
  deadline = new Date(now.getTime() + DEFAULT_TIME_LIMIT_MS),
  clock = Date.now,
}: CleanupOptions): Promise<CleanupResult> {
  const result: CleanupResult = {
    sessions: 0,
    rateLimitBuckets: 0,
    emailVerificationTokens: 0,
    passwordResetTokens: 0,
    unverifiedUsers: null,
  };
  for (const rule of CLEANUP_RULES) {
    const sql = batchSql(rule);
    const cutoff = new Date(now.getTime() - rule.graceMs);
    let deleted = 0;
    try {
      while (clock() < deadline.getTime()) {
        const { affectedRows } = await em.execute<{ affectedRows: number }>(sql, [cutoff, batchSize], "run");
        deleted += affectedRows;
        if (affectedRows < batchSize) break;
      }
      result[rule.key] = deleted;
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== UNDEFINED_TABLE) throw error;
      result[rule.key] = null;
    }
  }
  return result;
}
