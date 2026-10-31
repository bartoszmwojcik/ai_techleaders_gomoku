import { AppError, MCP_JOIN_WINDOW_MS, INVITATION_LOOKUP_WINDOW_MS, READY_DEADLINE_MS } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { hashOpaqueToken } from "../../http/opaque-token";
import { AgentSeatService, type AgentJoinGuard } from "./agent-seat-service";

const NOW = new Date("2026-10-31T12:00:00Z");
const GUARD: AgentJoinGuard = {
  lookup: { key: "agent-lookup:ip:abc", limit: 20 },
  join: { key: "mcp-join:ip:abc", limit: 10 },
};
const CODE = "ABCD-EFGH";

type Row = Record<string, unknown>;

const invitationRow = (over: Row = {}): Row => ({
  id: "inv-1",
  game_id: "game-1",
  consumed_at: null,
  expired: false,
  status: "waiting",
  creator_id: "user-a",
  creator_name: "Ala",
  creator_kind: "account",
  creator_nickname: null,
  ...over,
});

function setup(
  options: {
    invitations?: (Row | null)[];
    consume?: Row[];
    start?: Row[];
    blackSeat?: 1 | 2;
    failWith?: { match: string; error: unknown };
    release?: () => Promise<void>;
  } = {},
) {
  const invitations = options.invitations ?? [invitationRow()];
  let reads = 0;
  const calls: { sql: string; params: unknown[] }[] = [];
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql: sql.trim().replace(/\s+/g, " "), params });
    if (options.failWith && sql.includes(options.failWith.match)) throw options.failWith.error;
    if (sql.includes("from invitations i")) {
      const row = invitations[Math.min(reads, invitations.length - 1)];
      reads += 1;
      return row ? [row] : [];
    }
    if (sql.includes("update invitations set consumed_at")) return options.consume ?? [{ id: "inv-1" }];
    if (sql.includes("insert into game_players")) return [{ id: "agent-1" }];
    if (sql.includes("update games set status = 'active'")) return options.start ?? [{ id: "game-1" }];
    return [];
  });
  const em = {
    execute,
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
  };
  const rateLimiter = {
    hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 1 })),
    release: vi.fn(options.release ?? (async () => undefined)),
  };
  const colorDraw = { drawBlackSeat: vi.fn(() => options.blackSeat ?? 1) };
  const service = new AgentSeatService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    rateLimiter: rateLimiter as never,
    colorDraw,
  });
  return { service, em, calls, rateLimiter, colorDraw };
}

const errorOf = async (promise: Promise<unknown>) => (await promise.catch((e: unknown) => e)) as AppError;
const sqlsOf = (calls: { sql: string }[]) => calls.map(({ sql }) => sql);

describe("AgentSeatService.join", () => {
  it("seats the agent atomically and returns its token once", async () => {
    const { service, calls, rateLimiter, em } = setup();

    const result = await service.join(CODE, "claude opus 5.5", GUARD);

    expect(result).toEqual({
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      gameId: "game-1",
      you: { seat: 2, color: "white" },
      status: "active",
      opponent: { kind: "account" },
    });
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(rateLimiter.hit).toHaveBeenNthCalledWith(1, GUARD.join.key, GUARD.join.limit, MCP_JOIN_WINDOW_MS);
    expect(rateLimiter.hit).toHaveBeenNthCalledWith(2, GUARD.lookup.key, GUARD.lookup.limit, INVITATION_LOOKUP_WINDOW_MS);
    // A good code gives the attempt back; a successful join keeps its place in the join limit.
    expect(rateLimiter.release).toHaveBeenCalledExactlyOnceWith(GUARD.lookup.key, INVITATION_LOOKUP_WINDOW_MS);
    const sqls = sqlsOf(calls);
    const order = [
      "from invitations i",
      "from users where id in",
      "from games where id in",
      "with expired",
      "with stale",
      "from invitations i",
      "update invitations set consumed_at",
      "insert into game_players",
      "update invitations set consumed_by_id",
      "update games set status = 'active'",
    ];
    let at = -1;
    for (const marker of order) {
      const next = sqls.findIndex((sql, index) => index > at && sql.includes(marker));
      expect(next, marker).toBeGreaterThan(at);
      at = next;
    }
    const insert = calls.find(({ sql }) => sql.includes("insert into game_players"))!;
    expect(insert.sql).toContain("'agent'");
    expect(insert.sql).toContain("'mcp'");
    expect(insert.params).toEqual(["game-1", hashOpaqueToken(result.token), "claude opus 5.5", NOW, NOW]);
    expect(calls.find(({ sql }) => sql.includes("from games where id in"))!.params).toEqual(["game-1"]);
    expect(calls.find(({ sql }) => sql.includes("from users where id in"))!.params).toEqual(["user-a"]);
    const cancel = calls.find(({ sql }) => sql.includes("with stale"))!;
    expect(cancel.params[0]).toEqual(new Date(NOW.getTime() - READY_DEADLINE_MS));
    expect(JSON.stringify(result)).not.toContain("Ala");
  });

  it("joins a game of a guest creator without locking a user, and with black when drawn", async () => {
    const { service, calls } = setup({
      invitations: [invitationRow({ creator_id: null, creator_kind: "guest", creator_name: null, creator_nickname: "Kasia" })],
      blackSeat: 2,
    });

    const result = await service.join("https://x.example/invite/ABCD-EFGH?z=1", undefined, GUARD);

    expect(result).toMatchObject({ you: { seat: 2, color: "black" }, opponent: { kind: "guest" } });
    expect(sqlsOf(calls).some((sql) => sql.includes("from users where id in"))).toBe(false);
    expect(calls.find(({ sql }) => sql.includes("insert into game_players"))!.params[2]).toBeNull();
    expect(JSON.stringify(result)).not.toContain("Kasia");
  });

  it("treats a name of spaces only as no name", async () => {
    const { service, calls } = setup();
    await service.join(` ${CODE} `, "   ", GUARD);
    expect(calls.find(({ sql }) => sql.includes("insert into game_players"))!.params[2]).toBeNull();
  });

  it.each([
    ["a code that is not text", 5, undefined],
    ["a missing code", undefined, undefined],
    ["an empty code", "   ", undefined],
    ["a code longer than 64 characters", "A".repeat(65), undefined],
    ["a name that is not text", CODE, 5],
    ["a name with a link", CODE, "evil.com"],
    ["a name with markup", CODE, "<b>x</b>"],
    ["a name longer than 40 characters", CODE, "a".repeat(41)],
  ])("refuses %s before anything is counted or consumed", async (_label, code, name) => {
    const { service, rateLimiter, em, calls } = setup();

    const error = await errorOf(service.join(code, name, GUARD));

    expect(error).toMatchObject({ status: 400, code: "INVALID_INPUT" });
    expect(JSON.stringify(error.toBody())).not.toContain("evil.com");
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(em.transactional).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["a malformed code", "ABCD-EF"],
    ["two codes", "ABCD-EFGH ABCD-EFGH"],
    ["a link without a code", "https://x.example/invite/"],
  ])("answers %s with the uniform 410 and keeps the attempt spent", async (_label, code) => {
    const { service, rateLimiter, em } = setup();

    const error = await errorOf(service.join(code, undefined, GUARD));

    expect(error).toMatchObject({ status: 410, code: "INVALID_INVITATION" });
    expect(em.transactional).not.toHaveBeenCalled();
    // The failed lookup stays in the pool of failed codes, but gives back the place among the joins.
    expect(rateLimiter.release).toHaveBeenCalledExactlyOnceWith(GUARD.join.key, MCP_JOIN_WINDOW_MS);
  });

  it.each([
    ["an unknown code", { invitations: [] as Row[] }],
    ["a used invitation", { invitations: [invitationRow({ consumed_at: "2026-10-31 10:00:00+00" })] }],
    ["a cancelled game", { invitations: [invitationRow({ status: "cancelled" })] }],
    ["a game that started", { invitations: [invitationRow({ status: "active" })] }],
    ["an invitation lost to a concurrent join", { consume: [] as Row[] }],
    ["a game started by someone else meanwhile", { start: [] as Row[] }],
    [
      "a game closed under the lock",
      { invitations: [invitationRow(), invitationRow({ status: "cancelled" })] },
    ],
    ["a game that vanished under the lock", { invitations: [invitationRow(), null] }],
  ])("answers %s with the uniform 410", async (_label, options) => {
    const { service, rateLimiter } = setup(options as Parameters<typeof setup>[0]);

    const error = await errorOf(service.join(CODE, undefined, GUARD));

    expect(error).toMatchObject({ status: 410, code: "INVALID_INVITATION" });
    expect(rateLimiter.release).toHaveBeenCalledExactlyOnceWith(GUARD.join.key, MCP_JOIN_WINDOW_MS);
  });

  it("answers a third player at the seat (unique index) with the uniform 410", async () => {
    const { service } = setup({
      failWith: {
        match: "insert into game_players",
        error: Object.assign(new Error("duplicate"), { code: "23505", constraint: "game_players_game_id_seat_unique" }),
      },
    });
    await expect(service.join(CODE, undefined, GUARD)).rejects.toMatchObject({ status: 410, code: "INVALID_INVITATION" });
  });

  it("lets other database errors through, giving back the join place but spending the attempt", async () => {
    const boom = Object.assign(new Error("boom"), { code: "23505", constraint: "something_else" });
    const { service, rateLimiter } = setup({ failWith: { match: "insert into game_players", error: boom } });

    await expect(service.join(CODE, undefined, GUARD)).rejects.toBe(boom);

    // Not the uniform 410: the attempt in the pool of failed codes is given back as well.
    expect(rateLimiter.release).toHaveBeenCalledTimes(2);
    expect(rateLimiter.release).toHaveBeenCalledWith(GUARD.join.key, MCP_JOIN_WINDOW_MS);
  });

  it("lets an error without a SQL state through", async () => {
    const boom = new Error("boom");
    const { service } = setup({ failWith: { match: "insert into game_players", error: boom } });
    await expect(service.join(CODE, undefined, GUARD)).rejects.toBe(boom);
  });

  it("refuses with 429 before the lookup when the join limit is spent", async () => {
    const { service, rateLimiter, em } = setup();
    const limited = Object.assign(new Error("limit"), { status: 429 });
    rateLimiter.hit.mockRejectedValueOnce(limited);

    await expect(service.join(CODE, undefined, GUARD)).rejects.toBe(limited);

    expect(rateLimiter.hit).toHaveBeenCalledOnce();
    expect(em.transactional).not.toHaveBeenCalled();
    expect(rateLimiter.release).not.toHaveBeenCalled();
  });

  it("refuses with 429 when the pool of failed codes is spent, and gives the join place back", async () => {
    const { service, rateLimiter, em } = setup();
    const limited = Object.assign(new Error("limit"), { status: 429 });
    rateLimiter.hit.mockResolvedValueOnce({ count: 1, retryAfterSeconds: 1 }).mockRejectedValueOnce(limited);

    await expect(service.join(CODE, undefined, GUARD)).rejects.toBe(limited);

    expect(em.transactional).not.toHaveBeenCalled();
    expect(rateLimiter.release).toHaveBeenCalledExactlyOnceWith(GUARD.join.key, MCP_JOIN_WINDOW_MS);
  });

  it("survives a failing release of the join place and keeps the original error", async () => {
    const { service } = setup({ invitations: [], release: () => Promise.reject(new Error("db down")) });
    await expect(service.join(CODE, undefined, GUARD)).rejects.toMatchObject({ status: 410, code: "INVALID_INVITATION" });
  });
});
