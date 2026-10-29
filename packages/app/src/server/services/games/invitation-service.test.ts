import {
  AppError,
  GoneError,
  INVITATION_LOOKUP_WINDOW_MS,
  READY_DEADLINE_MS,
  TooManyRequestsError,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { InvitationService, type AcceptInput, type LookupGuard } from "./invitation-service";

const NOW = new Date("2026-10-29T12:00:00Z");
const CUTOFF = new Date(NOW.getTime() - READY_DEADLINE_MS);
const GUARD: LookupGuard = { key: "invitation-lookup:ip:abc", limit: 20 };
const CODE = "ABCD-EFGH";
const USER = "user-b";
const CREATOR = "user-a";
const AS_USER: AcceptInput = { as: "user" };

type Row = Record<string, unknown>;

const invitationRow = (over: Row = {}): Row => ({
  id: "inv-1",
  game_id: "game-1",
  consumed_at: null,
  expired: false,
  status: "waiting",
  creator_id: CREATOR,
  creator_name: "Ala",
  ...over,
});

function setup(
  options: {
    invitation?: Row[] | null;
    member?: Row[];
    slot?: Row[][];
    consume?: Row[];
    start?: Row[];
    cancelWaiting?: Row[];
    failWith?: { match: string; error: unknown };
  } = {},
) {
  const invitations = options.invitation === null ? [] : (options.invitation ?? [invitationRow()]);
  const slots = [...(options.slot ?? [])];
  let invitationReads = 0;
  const calls: { sql: string; params: unknown[] }[] = [];
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql: sql.trim().replace(/\s+/g, " "), params });
    const { failWith } = options;
    if (failWith && sql.includes(failWith.match)) throw failWith.error;
    if (sql.includes("from invitations i")) {
      const row = invitations[Math.min(invitationReads, invitations.length - 1)];
      invitationReads += 1;
      return row ? [row] : [];
    }
    if (sql.includes("select seat from game_players")) return options.member ?? [];
    if (sql.includes("from game_players p join games g")) return slots.shift() ?? [];
    if (sql.includes("update invitations set consumed_at")) return options.consume ?? [{ id: "inv-1" }];
    if (sql.includes("insert into game_players")) return [{ id: "player-2" }];
    if (sql.includes("update games set status = 'active'")) return options.start ?? [{ id: "game-1" }];
    if (sql.includes("update games set status = 'cancelled' where id = ?"))
      return options.cancelWaiting ?? [{ id: "own-game" }];
    return [];
  });
  const em = {
    execute,
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
  };
  const rateLimiter = {
    assertBelow: vi.fn(async () => undefined),
    hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 1 })),
  };
  const timeoutSettler = { settleFor: vi.fn(async () => undefined) };
  const service = new InvitationService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    rateLimiter: rateLimiter as never,
    timeoutSettler,
  });
  return { service, em, execute, calls, rateLimiter, timeoutSettler };
}

const sqlsOf = (calls: { sql: string }[]) => calls.map(({ sql }) => sql);
const errorOf = async (promise: Promise<unknown>) => (await promise.catch((e: unknown) => e)) as AppError;

describe("InvitationService.accept", () => {
  it("joins atomically: settles, locks users then games in id order, sweeps, consumes, seats, starts", async () => {
    const { service, calls, rateLimiter, timeoutSettler, em } = setup();

    const result = await service.accept(CODE, { userId: USER }, AS_USER, GUARD);

    expect(result).toEqual({ gameId: "game-1" });
    expect(rateLimiter.assertBelow).toHaveBeenCalledWith(GUARD.key, GUARD.limit, INVITATION_LOOKUP_WINDOW_MS);
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(timeoutSettler.settleFor).toHaveBeenCalledWith(USER);
    expect(em.transactional).toHaveBeenCalledOnce();
    const sqls = sqlsOf(calls);
    const order = [
      "from invitations i",
      "from users where id in",
      "from games where id in",
      "with expired",
      "with stale",
      "with expired",
      "with stale",
      "from invitations i",
      "select seat from game_players",
      "from game_players p join games g",
      "update invitations set consumed_at",
      "insert into game_players",
      "set consumed_by",
      "update games set status = 'active'",
    ];
    let cursor = -1;
    for (const part of order) {
      const index = sqls.findIndex((sql, i) => i > cursor && sql.includes(part));
      expect(index, part).toBeGreaterThan(cursor);
      cursor = index;
    }
    // Users sorted by id (user-a < user-b), games sorted.
    expect(calls.find(({ sql }) => sql.includes("from users"))!.params).toEqual([CREATOR, USER]);
    expect(calls.find(({ sql }) => sql.includes("from games where id in"))!.params).toEqual(["game-1"]);
    // Sweeps: game first, then the user's own slots.
    const sweeps = calls.filter(({ sql }) => sql.startsWith("with"));
    expect(sweeps.map(({ params }) => params)).toEqual([
      [NOW, "game-1"],
      [CUTOFF, "game-1"],
      [NOW, USER],
      [CUTOFF, USER],
    ]);
    // The joiner is seen at once (Q20) and the code is stored normalized.
    expect(calls.find(({ sql }) => sql.includes("insert into game_players"))!.params).toEqual([
      "game-1",
      USER,
      NOW,
      NOW,
    ]);
    expect(calls.find(({ sql }) => sql.includes("set consumed_at"))!.params).toEqual([NOW, "ABCDEFGH", NOW]);
    expect(calls.find(({ sql }) => sql.includes("set consumed_by"))!.params).toEqual(["player-2", "inv-1"]);
  });

  it("locks only the joiner when the creator account is gone", async () => {
    const { service, calls } = setup({ invitation: [invitationRow({ creator_id: null })] });
    await service.accept(CODE, { userId: USER }, AS_USER, GUARD);
    expect(calls.find(({ sql }) => sql.includes("from users"))!.params).toEqual([USER]);
  });

  it("answers 401 without a session, before touching the limiter", async () => {
    const { service, rateLimiter } = setup();
    const error = await errorOf(service.accept(CODE, {}, AS_USER, GUARD));
    expect(error.status).toBe(401);
    expect(rateLimiter.assertBelow).not.toHaveBeenCalled();
  });

  it("refuses with 429 once the pool of failed lookups is spent, even for a valid code", async () => {
    const { service, rateLimiter, em } = setup();
    rateLimiter.assertBelow.mockRejectedValue(new TooManyRequestsError("limit", { retryAfterSeconds: 9 }));
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.status).toBe(429);
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("counts a malformed code as a failed lookup and answers like an unknown one", async () => {
    const { service, rateLimiter, em } = setup();
    const error = await errorOf(service.accept("nope", { userId: USER }, AS_USER, GUARD));
    expect(error).toBeInstanceOf(GoneError);
    expect(error.code).toBe("INVALID_INVITATION");
    expect(rateLimiter.hit).toHaveBeenCalledWith(GUARD.key, GUARD.limit, INVITATION_LOOKUP_WINDOW_MS);
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("answers an unknown code with the uniform 410 and counts it", async () => {
    const { service, rateLimiter } = setup({ invitation: null });
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.status).toBe(410);
    expect(error.code).toBe("INVALID_INVITATION");
    expect(rateLimiter.hit).toHaveBeenCalledOnce();
  });

  it("answers 410 when the invitation vanishes between the peek and the lock", async () => {
    const { service, execute } = setup();
    let reads = 0;
    execute.mockImplementation(async (sql: string) =>
      sql.includes("from invitations i") && reads++ === 0 ? [invitationRow()] : [],
    );
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.code).toBe("INVALID_INVITATION");
  });

  it("refuses the creator with OWN_INVITATION and the game id", async () => {
    const { service, rateLimiter } = setup({ member: [{ seat: 1 }] });
    const error = await errorOf(service.accept(CODE, { userId: CREATOR }, AS_USER, GUARD));
    expect(error.status).toBe(409);
    expect(error.code).toBe("OWN_INVITATION");
    expect(error.data).toEqual({ gameId: "game-1" });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it.each([
    ["the joiner coming back", { seat: 2 }, "active"],
    ["the joiner of a game nobody opened (cancelled)", { seat: 2 }, "cancelled"],
    ["the creator of a game in progress", { seat: 1 }, "active"],
    ["the creator of a finished game", { seat: 1 }, "finished"],
  ])("returns the game for %s", async (_name, member, status) => {
    const { service, calls } = setup({
      member: [member],
      invitation: [invitationRow({ status, consumed_at: NOW })],
    });
    const result = await service.accept(CODE, { userId: USER }, AS_USER, GUARD);
    expect(result).toEqual({ gameId: "game-1" });
    expect(sqlsOf(calls).some((sql) => sql.includes("insert into game_players"))).toBe(false);
  });

  it("answers 410 for the creator of a cancelled game (link invalid after cancelling, L04)", async () => {
    const { service } = setup({
      member: [{ seat: 1 }],
      invitation: [invitationRow({ status: "cancelled" })],
    });
    const error = await errorOf(service.accept(CODE, { userId: CREATOR }, AS_USER, GUARD));
    expect(error.code).toBe("INVALID_INVITATION");
  });

  it.each([
    ["cancelled", { status: "cancelled" }],
    ["a third person (game already active)", { status: "active", consumed_at: NOW }],
    ["consumed", { consumed_at: NOW }],
  ])("answers the uniform 410 for %s and counts the failure", async (_name, over) => {
    const { service, rateLimiter } = setup({ invitation: [invitationRow(over)] });
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.status).toBe(410);
    expect(error.code).toBe("INVALID_INVITATION");
    expect(error.message).toBe("To zaproszenie jest już nieważne.");
    expect(rateLimiter.hit).toHaveBeenCalledOnce();
  });

  it.each([
    ["a game in progress", { game_id: "other", status: "active", seat: 2 }],
    ["a waiting game as seat 2", { game_id: "other", status: "waiting", seat: 2 }],
  ])("refuses a joiner who holds a slot in %s (BR-13)", async (_name, slot) => {
    const { service, rateLimiter } = setup({ slot: [[slot]] });
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.status).toBe(409);
    expect(error.code).toBe("ACTIVE_GAME_EXISTS");
    expect(error.data).toEqual({ gameId: "other" });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("offers to cancel an own waiting game (Q18) without doing it unasked", async () => {
    const own = { game_id: "own-game", status: "waiting", seat: 1 };
    const { service, calls } = setup({ slot: [[own]] });
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.status).toBe(409);
    expect(error.code).toBe("OWN_WAITING_GAME");
    expect(error.data).toEqual({ gameId: "own-game" });
    expect(sqlsOf(calls).some((sql) => sql.includes("update games set status = 'cancelled' where id = ?"))).toBe(false);
  });

  it("cancels the own waiting game in the same transaction when asked, locking both games in id order", async () => {
    const own = { game_id: "a-own-game", status: "waiting", seat: 1 };
    const { service, calls } = setup({ slot: [[own], [own]] });

    const result = await service.accept(CODE, { userId: USER }, { as: "user", cancelOwnWaitingGame: true }, GUARD);

    expect(result).toEqual({ gameId: "game-1" });
    expect(calls.find(({ sql }) => sql.includes("from games where id in"))!.params).toEqual(["a-own-game", "game-1"]);
    const sqls = sqlsOf(calls);
    const cancel = sqls.findIndex((sql) => sql.includes("update games set status = 'cancelled' where id = ?"));
    const release = sqls.findIndex((sql) => sql.includes("update game_players set is_active = false where game_id"));
    const consume = sqls.findIndex((sql) => sql.includes("update invitations set consumed_at"));
    expect(cancel).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(cancel);
    expect(consume).toBeGreaterThan(release);
  });

  it("does not cancel a game in progress even when asked (Q18: only waiting games)", async () => {
    const active = { game_id: "other", status: "active", seat: 1 };
    const { service, calls } = setup({ slot: [[active], [active]] });
    const error = await errorOf(
      service.accept(CODE, { userId: USER }, { as: "user", cancelOwnWaitingGame: true }, GUARD),
    );
    expect(error.code).toBe("ACTIVE_GAME_EXISTS");
    expect(calls.find(({ sql }) => sql.includes("from games where id in"))!.params).toEqual(["game-1"]);
  });

  it("does not cancel a waiting game that was not locked (it changed after the peek)", async () => {
    const { service } = setup({
      slot: [
        [{ game_id: "old-own", status: "waiting", seat: 1 }],
        [{ game_id: "new-own", status: "waiting", seat: 1 }],
      ],
    });
    const error = await errorOf(
      service.accept(CODE, { userId: USER }, { as: "user", cancelOwnWaitingGame: true }, GUARD),
    );
    expect(error.code).toBe("OWN_WAITING_GAME");
    expect(error.data).toEqual({ gameId: "new-own" });
  });

  it.each([
    ["the invitation was consumed first", { consume: [] }],
    ["the game was cancelled first", { start: [] }],
  ])("rolls back with 410 when %s (the conditional update returns no row)", async (_name, options) => {
    const { service, rateLimiter } = setup(options);
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.code).toBe("INVALID_INVITATION");
    expect(rateLimiter.hit).toHaveBeenCalledOnce();
  });

  it("maps the BR-13 index to ACTIVE_GAME_EXISTS", async () => {
    const { service } = setup({
      failWith: {
        match: "insert into game_players",
        error: Object.assign(new Error("dup"), { code: "23505", constraint: "game_players_user_id_active_unique" }),
      },
    });
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.status).toBe(409);
    expect(error.code).toBe("ACTIVE_GAME_EXISTS");
  });

  it("maps the seat index (a third player) to the uniform 410", async () => {
    const { service, rateLimiter } = setup({
      failWith: {
        match: "insert into game_players",
        error: Object.assign(new Error("dup"), { code: "23505", constraint: "game_players_game_id_seat_unique" }),
      },
    });
    const error = await errorOf(service.accept(CODE, { userId: USER }, AS_USER, GUARD));
    expect(error.code).toBe("INVALID_INVITATION");
    expect(rateLimiter.hit).toHaveBeenCalledOnce();
  });

  it.each([
    ["another unique index", { code: "23505", constraint: "something_else" }],
    ["another database error", { code: "57P01" }],
  ])("rethrows %s", async (_name, props) => {
    const failure = Object.assign(new Error("boom"), props);
    const { service } = setup({ failWith: { match: "insert into game_players", error: failure } });
    await expect(service.accept(CODE, { userId: USER }, AS_USER, GUARD)).rejects.toBe(failure);
  });
});

describe("InvitationService.preview", () => {
  it("shows a free invitation to an anonymous visitor without touching state", async () => {
    const { service, calls, rateLimiter, em, timeoutSettler } = setup();
    const preview = await service.preview(CODE, {}, GUARD);
    expect(preview).toEqual({ creatorName: "Ala", state: "joinable" });
    expect(rateLimiter.assertBelow).toHaveBeenCalledWith(GUARD.key, GUARD.limit, INVITATION_LOOKUP_WINDOW_MS);
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(em.transactional).not.toHaveBeenCalled();
    expect(timeoutSettler.settleFor).not.toHaveBeenCalled();
    expect(sqlsOf(calls).every((sql) => sql.startsWith("select"))).toBe(true);
  });

  it("is joinable for a signed-in user without a slot, after settling their timeouts", async () => {
    const { service, timeoutSettler } = setup();
    expect(await service.preview(CODE, { userId: USER }, GUARD)).toEqual({
      creatorName: "Ala",
      state: "joinable",
    });
    expect(timeoutSettler.settleFor).toHaveBeenCalledWith(USER);
  });

  it("recognizes the creator of a waiting game", async () => {
    const { service } = setup({ member: [{ seat: 1 }] });
    expect(await service.preview(CODE, { userId: CREATOR }, GUARD)).toEqual({
      creatorName: "Ala",
      state: "own-invitation",
      gameId: "game-1",
    });
  });

  it.each([
    ["the joiner", { seat: 2 }, "active"],
    ["the joiner of a cancelled game", { seat: 2 }, "cancelled"],
    ["the creator of a game in progress", { seat: 1 }, "active"],
  ])("recognizes %s as a participant", async (_name, member, status) => {
    const { service } = setup({ member: [member], invitation: [invitationRow({ status, consumed_at: NOW })] });
    expect(await service.preview(CODE, { userId: USER }, GUARD)).toMatchObject({
      state: "participant",
      gameId: "game-1",
    });
  });

  it("is invalid for the creator of an expired or cancelled game", async () => {
    for (const over of [
      { expired: true },
      { status: "cancelled" },
    ]) {
      const { service } = setup({ member: [{ seat: 1 }], invitation: [invitationRow(over)] });
      const error = await errorOf(service.preview(CODE, { userId: CREATOR }, GUARD));
      expect(error.code).toBe("INVALID_INVITATION");
    }
  });

  it.each([
    ["unknown", null],
    ["consumed", [invitationRow({ consumed_at: NOW })]],
    ["active", [invitationRow({ status: "active" })]],
    ["expired", [invitationRow({ expired: true })]],
  ])("answers the uniform 410 for a %s code and counts it", async (_name, invitation) => {
    const { service, rateLimiter } = setup({ invitation });
    const error = await errorOf(service.preview(CODE, {}, GUARD));
    expect(error.status).toBe(410);
    expect(error.code).toBe("INVALID_INVITATION");
    expect(rateLimiter.hit).toHaveBeenCalledWith(GUARD.key, GUARD.limit, INVITATION_LOOKUP_WINDOW_MS);
  });

  it("answers a malformed code like an unknown one", async () => {
    const { service, rateLimiter } = setup();
    const error = await errorOf(service.preview("x", {}, GUARD));
    expect(error.code).toBe("INVALID_INVITATION");
    expect(rateLimiter.hit).toHaveBeenCalledOnce();
  });

  it("flags a viewer who is busy with a game in progress", async () => {
    const { service } = setup({ slot: [[{ game_id: "other", status: "active", seat: 1 }]] });
    expect(await service.preview(CODE, { userId: USER }, GUARD)).toEqual({
      creatorName: "Ala",
      state: "has-active-game",
      gameId: "other",
    });
  });

  it("flags a viewer with an own waiting game (Q18)", async () => {
    const { service } = setup({ slot: [[{ game_id: "own", status: "waiting", seat: 1 }]] });
    expect(await service.preview(CODE, { userId: USER }, GUARD)).toEqual({
      creatorName: "Ala",
      state: "has-own-waiting-game",
      gameId: "own",
    });
  });

  it("refuses with 429 before looking anything up when the pool is spent", async () => {
    const { service, rateLimiter, execute } = setup();
    rateLimiter.assertBelow.mockRejectedValue(new TooManyRequestsError("limit"));
    const error = await errorOf(service.preview(CODE, {}, GUARD));
    expect(error.status).toBe(429);
    expect(execute).not.toHaveBeenCalled();
  });
});
