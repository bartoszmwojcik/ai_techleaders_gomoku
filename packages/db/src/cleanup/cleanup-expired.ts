import type { EntityManager } from "@mikro-orm/postgresql";

import { CLEANUP_RULES, type CleanupRule } from "./rules";

export const DEFAULT_BATCH_SIZE = 1000;
/** Time budget of a single rule (4 rules x 15 s = the old 60 s overall); a slow rule cannot starve the later ones. */
export const DEFAULT_RULE_TIME_LIMIT_MS = 15_000;

const UNDEFINED_TABLE = "42P01";

/** A rule that failed: its key and the SQL state code / error class only — never a message (it may carry values). */
export type CleanupError = { rule: string; code?: string };

/** Deleted rows per rule (rows removed before a failure included); `null` = optional table absent or rule unavailable. */
export type CleanupResult = {
  sessions: number | null;
  rateLimitBuckets: number | null;
  emailVerificationTokens: number | null;
  passwordResetTokens: number | null;
  /** Always `null` until the game participants table (#29) exists (BR-28). */
  unverifiedUsers: number | null;
  /** Rules that raised an error; the remaining rules still ran. Empty on success. */
  errors: CleanupError[];
  /** `true` when some rule stopped on its time budget before running out of rows; the next run continues. */
  truncated: boolean;
};

export type CleanupOptions = {
  em: Pick<EntityManager, "execute">;
  now: Date;
  batchSize?: number;
  /** Time budget per rule: no new batch starts after it (default 15 s). */
  ruleTimeLimitMs?: number;
  /** Current time source for the budget check. */
  clock?: () => number;
  /** Rules to run (default: the registry in `rules.ts`; overridable for tests). */
  rules?: readonly CleanupRule[];
};

// Identifiers come from the static rules, never from callers; values are bound parameters.
// MikroORM's `em.execute` binds `?` placeholders (not `$n`): one cutoff per `?` of the condition, then the limit.
function batchSql({ table, primaryKey, condition }: CleanupRule): string {
  return `delete from ${table} where ${primaryKey} in (select ${primaryKey} from ${table} where ${condition} limit ? for update skip locked)`;
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") return code;
  return error instanceof Error ? error.name : undefined;
}

/**
 * Deletes expired/used rows in short batches (one autocommit statement each) until a rule is
 * exhausted or its time budget passes; the remainder is left for the next run. An error in one
 * rule is recorded in `errors` and the following rules still run.
 */
export async function cleanupExpired({
  em,
  now,
  batchSize = DEFAULT_BATCH_SIZE,
  ruleTimeLimitMs = DEFAULT_RULE_TIME_LIMIT_MS,
  clock = Date.now,
  rules = CLEANUP_RULES,
}: CleanupOptions): Promise<CleanupResult> {
  const result: CleanupResult = {
    sessions: 0,
    rateLimitBuckets: 0,
    emailVerificationTokens: 0,
    passwordResetTokens: 0,
    unverifiedUsers: null,
    errors: [],
    truncated: false,
  };
  for (const rule of rules) {
    const sql = batchSql(rule);
    const cutoff = new Date(now.getTime() - rule.graceMs);
    const cutoffs = Array.from({ length: rule.condition.split("?").length - 1 }, () => cutoff);
    const ruleDeadline = clock() + ruleTimeLimitMs;
    let deleted = 0;
    try {
      for (;;) {
        if (clock() >= ruleDeadline) {
          result.truncated = true;
          break;
        }
        const { affectedRows } = await em.execute<{ affectedRows: number }>(sql, [...cutoffs, batchSize], "run");
        deleted += affectedRows;
        if (affectedRows < batchSize) break;
      }
      result[rule.key] = deleted;
    } catch (error) {
      if (rule.optional && (error as { code?: unknown } | null)?.code === UNDEFINED_TABLE) {
        result[rule.key] = null;
        continue;
      }
      result[rule.key] = deleted;
      result.errors.push({ rule: rule.key, code: errorCode(error) });
    }
  }
  return result;
}
