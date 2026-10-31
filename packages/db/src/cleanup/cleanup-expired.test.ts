import { GUEST_TOKEN_GRACE_MS, READY_DEADLINE_MS } from "@gomoku/core";
import { describe, expect, it, vi } from "vitest";

import { entities } from "../entities";
import { cleanupExpired } from "./cleanup-expired";
import { CLEANUP_EXEMPT_TABLES, CLEANUP_RULES, LONGEST_RATE_LIMIT_WINDOW_MS, type CleanupRule } from "./rules";

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
      waitingGames: 0,
      cancelledGames: 0,
      guestOnlyActiveGames: 0,
      guestOnlyFinishedGames: 0,
      guestTokens: 0,
      unverifiedUsers: null,
      errors: [],
      truncated: false,
    });
    const cutoffs = Object.fromEntries(
      execute.mock.calls.map(([sql, params]) => [
        sql.match(/(?:delete from|update) (\w+)/)?.[1] + (sql.startsWith("update") ? ":clear" : sql.includes("status = 'waiting'") ? ":waiting" : sql.includes("status = 'cancelled'") ? ":cancelled" : sql.includes("status = 'active'") ? ":guestActive" : sql.includes("status = 'finished'") ? ":guestFinished" : ""),
        (params[0] as Date).getTime(),
      ]),
    );
    expect(cutoffs).toEqual({
      "games:waiting": NOW.getTime() - HOUR,
      "games:cancelled": NOW.getTime() - 25 * HOUR,
      "games:guestActive": NOW.getTime() - HOUR,
      "games:guestFinished": NOW.getTime() - HOUR,
      "game_players:clear": NOW.getTime() - HOUR,
      sessions: NOW.getTime() - HOUR,
      rate_limit_buckets: NOW.getTime() - 48 * HOUR,
      email_verification_tokens: NOW.getTime() - 24 * HOUR,
      password_reset_tokens: NOW.getTime() - 24 * HOUR,
    });
    expect(execute.mock.calls[0]).toEqual([expect.stringContaining("expires_at < ?"), [expect.any(Date), 1000], "run"]);
  });

  it("covers used and expired tokens, and skips locked rows", async () => {
    const { em, execute } = fakeEm(() => 0);
    await cleanupExpired({ em, now: NOW });
    const sqls = execute.mock.calls.map(([sql]) => sql);
    expect(sqls.filter((s) => s.includes("expires_at < ? or used_at < ?"))).toHaveLength(2);
    expect(sqls.every((s) => s.includes("for update skip locked"))).toBe(true);
    // One bound cutoff per `?` of the condition (MikroORM binds `?`, not `$n`), then the limit.
    const tokenCall = execute.mock.calls.find(([sql]) => sql.includes("from password_reset_tokens"));
    expect(tokenCall?.[1]).toEqual([expect.any(Date), expect.any(Date), 1000]);
    expect(tokenCall?.[1]?.[0]).toEqual(tokenCall?.[1]?.[1]);
  });

  it("deletes games by their own conditions and only clears the guest token hash", async () => {
    const { em, execute } = fakeEm(() => 0);
    await cleanupExpired({ em, now: NOW });
    const sqlOf = (text: string) => execute.mock.calls.map(([sql]) => sql).find((sql) => sql.includes(text))!;
    expect(sqlOf("status = 'waiting'")).toMatch(/^delete from games where id in/);
    expect(sqlOf("status = 'waiting'")).toContain("i.expires_at < ?");
    expect(sqlOf("status = 'cancelled'")).toMatch(/^delete from games where id in/);
    const clear = sqlOf("set guest_token_hash = null");
    expect(clear).toMatch(/^update game_players set guest_token_hash = null where id in/);
    expect(clear).not.toContain("delete");
    expect(clear).toContain("guest_token_hash is not null");
  });

  it("deletes guest-only games by kind (not user_id), with one cutoff per rule", async () => {
    const { em, execute } = fakeEm(() => 0);
    await cleanupExpired({ em, now: NOW });
    const sqls = execute.mock.calls.map(([sql]) => sql);
    const active = sqls.find((sql) => sql.includes("status = 'active'"))!;
    const finished = sqls.find((sql) => sql.includes("status = 'finished'"))!;
    for (const sql of [active, finished]) {
      expect(sql).toMatch(/^delete from games where id in/);
      expect(sql).toContain("p.kind <> 'guest'");
      expect(sql).not.toContain("user_id");
    }
    expect(active).toContain(`started_at + ${READY_DEADLINE_MS} * interval '1 millisecond'`);
    expect(active).toContain("turn_started_at + ");
    expect(finished).toContain("finished_at < ?");
  });

  it("registers the guest-only rules before the token rule", () => {
    const keys = CLEANUP_RULES.map((rule) => rule.key);
    expect(keys.slice(-3)).toEqual(["guestOnlyActiveGames", "guestOnlyFinishedGames", "guestTokens"]);
    for (const rule of CLEANUP_RULES.filter((r) => r.key.startsWith("guestOnly"))) {
      expect(rule.graceMs).toBe(GUEST_TOKEN_GRACE_MS);
    }
  });

  it("repeats full batches until a short one", async () => {
    const answers = [2, 2, 1];
    const { em, execute } = fakeEm((sql) => (sql.includes("from sessions") ? (answers.shift() as number) : 0));

    const result = await cleanupExpired({ em, now: NOW, batchSize: 2 });

    expect(result.sessions).toBe(5);
    expect(execute.mock.calls.filter(([sql]) => sql.includes("from sessions"))).toHaveLength(3);
    expect(execute.mock.calls[0]?.[1]?.[1]).toBe(2);
  });

  it("gives every rule its own time budget and flags truncation", async () => {
    const { em, execute } = fakeEm(() => 10);
    let t = 0;
    // Each clock() call advances 1 ms: a rule starts at t, its deadline is t + 3.
    const clock = () => t++;

    const result = await cleanupExpired({ em, now: NOW, batchSize: 10, ruleTimeLimitMs: 3, clock });

    // Every rule ran (none was starved by an earlier one) and each stopped on its own budget.
    expect(execute.mock.calls.map(([sql]) => sql.match(/(?:delete from|update) (\w+)/)?.[1])).toEqual(
      CLEANUP_RULES.flatMap((rule) => [rule.table, rule.table]),
    );
    expect(result).toMatchObject({ sessions: 20, rateLimitBuckets: 20, passwordResetTokens: 20, truncated: true });
  });

  it("does not flag truncation when every rule finishes inside its budget", async () => {
    const { em } = fakeEm(() => 0);
    const result = await cleanupExpired({ em, now: NOW, clock: () => NOW.getTime() });
    expect(result.truncated).toBe(false);
  });

  it("uses a 15 s default budget per rule", async () => {
    const { em, execute } = fakeEm(() => 0);
    let t = 0;
    // First clock() of a rule sets the deadline, the second checks it.
    await cleanupExpired({ em, now: NOW, clock: () => (t++ % 2 === 0 ? 0 : 15_000) });
    expect(execute).not.toHaveBeenCalled();
    t = 0;
    await cleanupExpired({ em, now: NOW, clock: () => (t++ % 2 === 0 ? 0 : 14_999) });
    expect(execute).toHaveBeenCalledTimes(CLEANUP_RULES.length);
  });

  it("treats a missing table as an error for a required rule and keeps going", async () => {
    const { em } = fakeEm((sql) =>
      sql.includes("from password_reset_tokens") ? Object.assign(new Error("no table"), { code: "42P01" }) : 1,
    );
    const result = await cleanupExpired({ em, now: NOW, batchSize: 5 });
    expect(result.passwordResetTokens).toBe(0);
    expect(result.sessions).toBe(1);
    expect(result.errors).toEqual([{ rule: "passwordResetTokens", code: "42P01" }]);
  });

  it("reports null for a missing table only when the rule is optional", async () => {
    const { em } = fakeEm(() => Object.assign(new Error("no table"), { code: "42P01" }));
    const rules: CleanupRule[] = CLEANUP_RULES.map((rule) => ({ ...rule, optional: rule.key === "sessions" }));
    const result = await cleanupExpired({ em, now: NOW, rules });
    expect(result.sessions).toBeNull();
    expect(result.errors.map((e) => e.rule)).toEqual(["rateLimitBuckets", "emailVerificationTokens", "passwordResetTokens", "waitingGames", "cancelledGames", "guestOnlyActiveGames", "guestOnlyFinishedGames", "guestTokens"]);
  });

  it("keeps the counts of finished rules and of rows deleted before an error", async () => {
    let sessionCalls = 0;
    const { em } = fakeEm((sql) => {
      if (sql.includes("from sessions")) return ++sessionCalls === 1 ? 2 : Object.assign(new Error("lost"), { code: "08006" });
      return sql.includes("from rate_limit_buckets") ? 1 : 0;
    });
    const result = await cleanupExpired({ em, now: NOW, batchSize: 2 });
    expect(result.sessions).toBe(2);
    expect(result.rateLimitBuckets).toBe(1);
    expect(result.errors).toEqual([{ rule: "sessions", code: "08006" }]);
  });

  it.each([
    [new TypeError("secret value"), "TypeError"],
    ["plain", undefined],
    [null, undefined],
  ])("records only a code or class name for errors (%s)", async (error, code) => {
    const em = { execute: vi.fn().mockRejectedValue(error) } as never;
    const result = await cleanupExpired({ em, now: NOW });
    expect(result.errors).toHaveLength(CLEANUP_RULES.length);
    expect(result.errors[0]).toEqual({ rule: "sessions", code });
    expect(JSON.stringify(result)).not.toContain("secret");
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

  it("keeps rate-limit counters at least 24 h beyond the longest limiter window", () => {
    const counters = CLEANUP_RULES.find((rule) => rule.key === "rateLimitBuckets")!;
    // The daily e-mail pools (`email-daily:*`) use a 24 h window: a literal here, checked against the
    // app's real constant in email-verification-service.test.ts.
    expect(LONGEST_RATE_LIMIT_WINDOW_MS).toBe(24 * HOUR);
    expect(counters.graceMs).toBeGreaterThanOrEqual(LONGEST_RATE_LIMIT_WINDOW_MS + 24 * HOUR);
  });

  it("marks no rule optional (a missing table is an error)", () => {
    expect(CLEANUP_RULES.filter((rule) => rule.optional)).toEqual([]);
  });
});
