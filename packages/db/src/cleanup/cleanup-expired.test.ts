import { describe, expect, it, vi } from "vitest";

import { entities } from "../entities";
import { cleanupExpired } from "./cleanup-expired";
import { CLEANUP_EXEMPT_TABLES, CLEANUP_RULES } from "./rules";

const NOW = new Date();
const HOUR = 3_600_000;

function fakeEm(responder: (sql: string, params: unknown[]) => number | Error) {
  const execute = vi.fn(async (sql: string, params: unknown[]) => {
    const out = responder(sql, params);
    if (out instanceof Error) throw out;
    return { affectedRows: out };
  });
  return { em: { execute } as never, execute };
}

describe("cleanupExpired", () => {
  it("applies each rule's cutoff and reports the deleted counts", async () => {
    const { em, execute } = fakeEm((sql) => (sql.includes("from sessions") ? 3 : 0));

    const result = await cleanupExpired({ em, now: NOW });

    expect(result).toEqual({
      sessions: 3,
      rateLimitBuckets: 0,
      emailVerificationTokens: 0,
      passwordResetTokens: 0,
      unverifiedUsers: null,
    });
    const cutoffs = Object.fromEntries(
      execute.mock.calls.map(([sql, params]) => [sql.match(/delete from (\w+)/)?.[1], (params[0] as Date).getTime()]),
    );
    expect(cutoffs).toEqual({
      sessions: NOW.getTime() - HOUR,
      rate_limit_buckets: NOW.getTime() - 24 * HOUR,
      email_verification_tokens: NOW.getTime() - 24 * HOUR,
      password_reset_tokens: NOW.getTime() - 24 * HOUR,
    });
    expect(execute.mock.calls[0]).toEqual([expect.stringContaining("expires_at < $1"), [expect.any(Date), 1000], "run"]);
  });

  it("covers used and expired tokens, and skips locked rows", async () => {
    const { em, execute } = fakeEm(() => 0);
    await cleanupExpired({ em, now: NOW });
    const sqls = execute.mock.calls.map(([sql]) => sql);
    expect(sqls.filter((s) => s.includes("expires_at < $1 or used_at < $1"))).toHaveLength(2);
    expect(sqls.every((s) => s.includes("for update skip locked"))).toBe(true);
  });

  it("repeats full batches until a short one", async () => {
    const answers = [2, 2, 1];
    const { em, execute } = fakeEm((sql) => (sql.includes("from sessions") ? (answers.shift() as number) : 0));

    const result = await cleanupExpired({ em, now: NOW, batchSize: 2 });

    expect(result.sessions).toBe(5);
    expect(execute.mock.calls.filter(([sql]) => sql.includes("from sessions"))).toHaveLength(3);
    expect(execute.mock.calls[0]?.[1]?.[1]).toBe(2);
  });

  it("stops starting batches at the deadline", async () => {
    const { em, execute } = fakeEm(() => 10);
    let t = 0;
    const clock = () => t++;

    const result = await cleanupExpired({ em, now: NOW, batchSize: 10, deadline: new Date(2), clock });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.sessions).toBe(20);
    expect(result.rateLimitBuckets).toBe(0);
  });

  it("uses a 60 s default deadline", async () => {
    const { em, execute } = fakeEm(() => 0);
    await cleanupExpired({ em, now: NOW, clock: () => NOW.getTime() + 60_000 });
    expect(execute).not.toHaveBeenCalled();
    await cleanupExpired({ em, now: NOW, clock: () => NOW.getTime() + 59_999 });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("reports null for a missing table and keeps going", async () => {
    const { em } = fakeEm((sql) =>
      sql.includes("from password_reset_tokens") ? Object.assign(new Error("no table"), { code: "42P01" }) : 1,
    );
    const result = await cleanupExpired({ em, now: NOW, batchSize: 5 });
    expect(result.passwordResetTokens).toBeNull();
    expect(result.sessions).toBe(1);
  });

  it.each([[Object.assign(new Error("boom"), { code: "08006" })], [null]])("rethrows other errors (%s)", async (error) => {
    const em = { execute: vi.fn().mockRejectedValue(error) } as never;
    await expect(cleanupExpired({ em, now: NOW })).rejects.toBe(error);
  });
});

describe("cleanup rules guard", () => {
  it("has a rule or an explicit exemption for every entity with an expiresAt column", () => {
    const covered = new Set([...CLEANUP_RULES.map((rule) => rule.table), ...CLEANUP_EXEMPT_TABLES]);
    const expiring = entities.filter((entity) => "expiresAt" in entity.meta.properties).map((e) => e.meta.tableName);
    expect(expiring.length).toBeGreaterThan(0);
    for (const table of expiring) expect(covered, table).toContain(table);
  });

  it("only references registered tables", () => {
    const tables = entities.map((entity) => entity.meta.tableName);
    for (const rule of CLEANUP_RULES) expect(tables).toContain(rule.table);
    for (const table of CLEANUP_EXEMPT_TABLES) expect(tables).toContain(table);
  });
});
