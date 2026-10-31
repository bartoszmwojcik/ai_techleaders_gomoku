import {
  AppError,
  LOBBY_LIST_LIMIT,
  LOBBY_MARK_LIMIT,
  LOBBY_MARK_WINDOW_MS,
  LOBBY_PICK_LIMIT,
  LOBBY_PICK_WINDOW_MS,
  SEEKING_TTL_MS,
  TooManyRequestsError,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { LobbyService } from "./lobby-service";

const NOW = new Date("2026-10-31T12:00:00Z");
const USER = "user-1";

type Row = Record<string, unknown>;

const meRow = (over: Row = {}): Row => ({
  id: "seeker-1",
  created_at: "2026-10-31 12:00:00+00",
  expires_in_ms: 300_000,
  ...over,
});

function setup(
  options: { locked?: Row[]; slot?: Row[]; me?: Row[]; list?: Row[]; currentGame?: unknown; hit?: Error } = {},
) {
  const calls: { sql: string; params: unknown[]; mode?: string }[] = [];
  const execute = vi.fn(async (sql: string, params: unknown[] = [], mode?: string) => {
    calls.push({ sql: sql.trim().replace(/\s+/g, " "), params, mode });
    if (sql.includes("for no key update")) return options.locked ?? [{ id: USER }];
    if (sql.includes("from game_players where user_id")) return options.slot ?? [];
    if (sql.includes("from lobby_seekers where user_id")) return options.me ?? [meRow()];
    if (sql.includes("from lobby_seekers s join users")) return options.list ?? [];
    return [];
  });
  const em = {
    execute,
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
  };
  const rateLimiter = {
    hit: vi.fn(async () => {
      if (options.hit) throw options.hit;
      return { count: 1, retryAfterSeconds: 1 };
    }),
  };
  const timeoutSettler = { settleFor: vi.fn(async () => undefined) };
  const gameParticipation = { currentGame: vi.fn(async () => options.currentGame ?? null) };
  const service = new LobbyService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    rateLimiter: rateLimiter as never,
    timeoutSettler: timeoutSettler as never,
    gameParticipation: gameParticipation as never,
    colorDraw: { drawBlackSeat: () => 2 } as never,
  });
  return { service, em, calls, rateLimiter, timeoutSettler, gameParticipation };
}

const errorOf = async (promise: Promise<unknown>) => (await promise.catch((e: unknown) => e)) as AppError;

describe("LobbyService.markSeeking", () => {
  it("limits, settles, then locks the user, closes stale slots, checks the slot and upserts", async () => {
    const { service, calls, rateLimiter, timeoutSettler, em } = setup();

    const me = await service.markSeeking(USER);

    expect(rateLimiter.hit).toHaveBeenCalledExactlyOnceWith(
      `lobby-mark:${USER}`,
      LOBBY_MARK_LIMIT,
      LOBBY_MARK_WINDOW_MS,
    );
    expect(timeoutSettler.settleFor).toHaveBeenCalledExactlyOnceWith(USER);
    expect(rateLimiter.hit.mock.invocationCallOrder[0]).toBeLessThan(
      timeoutSettler.settleFor.mock.invocationCallOrder[0]!,
    );
    expect(em.transactional).toHaveBeenCalledOnce();
    const expiresAt = new Date(NOW.getTime() + SEEKING_TTL_MS);
    const order = [
      "for no key update",
      "with expired",
      "with stale",
      "from game_players where user_id",
      "insert into lobby_seekers",
      "from lobby_seekers where user_id",
    ];
    let cursor = -1;
    for (const part of order) {
      const index = calls.findIndex(({ sql }, i) => i > cursor && sql.includes(part));
      expect(index, part).toBeGreaterThan(cursor);
      cursor = index;
    }
    expect(calls.find(({ sql }) => sql.includes("insert into lobby_seekers"))).toMatchObject({
      params: [USER, NOW, expiresAt, NOW],
      mode: "run",
    });
    // A live status is not renewed (Q3): the conflict branch only replaces a dead one.
    expect(calls.find(({ sql }) => sql.includes("insert into lobby_seekers"))!.sql).toContain(
      "where lobby_seekers.expires_at <= ?",
    );
    expect(me).toEqual({ id: "seeker-1", createdAt: new Date("2026-10-31T12:00:00Z"), expiresInMs: 300_000 });
  });

  it("returns the status the database holds, also an older one (idempotent)", async () => {
    const { service } = setup({ me: [meRow({ id: "old", expires_in_ms: 120_000 })] });

    expect(await service.markSeeking(USER)).toMatchObject({ id: "old", expiresInMs: 120_000 });
  });

  it("refuses with 409 and the game while the account holds a slot (BR-13), writing no status", async () => {
    const { service, calls } = setup({ slot: [{ game_id: "game-9" }] });

    const error = await errorOf(service.markSeeking(USER));

    expect(error.status).toBe(409);
    expect(error.code).toBe("ACTIVE_GAME_EXISTS");
    expect(error.data).toEqual({ gameId: "game-9" });
    expect(calls.some(({ sql }) => sql.includes("insert into lobby_seekers"))).toBe(false);
  });

  it("answers 401 when the account was deleted meanwhile, before touching any game", async () => {
    const { service, calls } = setup({ locked: [] });

    const error = await errorOf(service.markSeeking(USER));

    expect(error.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it("does nothing when the limit is spent", async () => {
    const { service, timeoutSettler, em } = setup({
      hit: new TooManyRequestsError("Za dużo prób.", { retryAfterSeconds: 30 }),
    });

    expect((await errorOf(service.markSeeking(USER))).status).toBe(429);
    expect(timeoutSettler.settleFor).not.toHaveBeenCalled();
    expect(em.transactional).not.toHaveBeenCalled();
  });
});

describe("LobbyService.withdraw", () => {
  it("deletes the status of the user and is fine without one", async () => {
    const { service, calls } = setup();

    await expect(service.withdraw(USER)).resolves.toBeUndefined();

    expect(calls).toEqual([
      { sql: "delete from lobby_seekers where user_id in (?)", params: [USER], mode: "run" },
    ]);
  });
});

describe("LobbyService.view", () => {
  it("returns the own status, the game and the other seekers, with times from the database", async () => {
    const { service, calls, gameParticipation } = setup({
      currentGame: { gameId: "game-1", status: "waiting", seat: 1 },
      list: [
        { id: "s2", display_name: "Alicja_99", since_ms: 60_000, expires_in_ms: 240_000 },
        { id: "s3", display_name: "czarny_kamień", since_ms: 0, expires_in_ms: 1000 },
      ],
    });

    const view = await service.view(USER);

    expect(gameParticipation.currentGame).toHaveBeenCalledExactlyOnceWith(USER);
    expect(view).toEqual({
      me: { id: "seeker-1", createdAt: new Date("2026-10-31T12:00:00Z"), expiresInMs: 300_000 },
      currentGame: { gameId: "game-1", status: "waiting" },
      seekers: [
        { id: "s2", displayName: "Alicja_99", sinceMs: 60_000, expiresInMs: 240_000 },
        { id: "s3", displayName: "czarny_kamień", sinceMs: 0, expiresInMs: 1000 },
      ],
    });
    const list = calls.find(({ sql }) => sql.includes("from lobby_seekers s join users"))!;
    expect(list.params).toEqual([NOW, NOW, NOW, USER, LOBBY_LIST_LIMIT]);
    // Oldest first, never the caller, never an account that holds a slot, nothing the user does not see (BR-14).
    expect(list.sql).toContain("order by s.created_at, s.id");
    expect(list.sql).toContain("s.user_id <> ?");
    expect(list.sql).toContain("not exists (select 1 from game_players p where p.user_id = s.user_id and p.is_active)");
    expect(list.sql).not.toContain("email");
    expect(list.sql.split(" from ")[0]).not.toContain("user_id");
  });

  it("has no status and no game for a user who does not seek and plays nothing", async () => {
    const { service } = setup({ me: [] });

    expect(await service.view(USER)).toEqual({ me: null, currentGame: null, seekers: [] });
  });
});

const PICKER = "user-a";
const OWNER = "user-b";
const SEEKER = "seeker-9";

/** Scripted answers for the pick; `pairSlots` is what `game_players` holds for the two accounts. */
function setupPick(
  options: {
    owner?: Row[];
    locked?: Row[];
    taken?: Row[];
    left?: Row[];
    pairSlots?: Row[];
    hit?: Error;
  } = {},
) {
  const base = setup({ hit: options.hit });
  const calls: { sql: string; params: unknown[]; mode?: string }[] = [];
  const execute = vi.fn(async (sql: string, params: unknown[] = [], mode?: string) => {
    calls.push({ sql: sql.trim().replace(/\s+/g, " "), params, mode });
    if (sql.includes("select user_id from lobby_seekers where id")) {
      return options.owner ?? [{ user_id: OWNER }];
    }
    if (sql.includes("for no key update")) return options.locked ?? [{ id: PICKER }, { id: OWNER }];
    if (sql.includes("delete from lobby_seekers where id")) return options.taken ?? [{ id: SEEKER }];
    if (sql.includes("expires_at <= ? as expired")) return options.left ?? [];
    if (sql.includes("from game_players where user_id in")) return options.pairSlots ?? [];
    if (sql.includes("insert into games")) return [{ id: "game-new" }];
    return [];
  });
  const em = {
    execute,
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
  };
  const service = new LobbyService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    rateLimiter: base.rateLimiter as never,
    timeoutSettler: base.timeoutSettler as never,
    gameParticipation: base.gameParticipation as never,
    colorDraw: { drawBlackSeat: () => 2 } as never,
  });
  return { service, calls, em, rateLimiter: base.rateLimiter, timeoutSettler: base.timeoutSettler };
}

const wrote = (calls: { sql: string }[], part: string) => calls.some(({ sql }) => sql.includes(part));

describe("LobbyService.pick", () => {
  it("limits, settles, locks both accounts by id, takes the seeker, then creates the game with both slots", async () => {
    const { service, calls, rateLimiter, timeoutSettler, em } = setupPick();

    const result = await service.pick(PICKER, SEEKER);

    expect(result).toEqual({ gameId: "game-new" });
    expect(rateLimiter.hit).toHaveBeenCalledExactlyOnceWith(
      `lobby-pick:${PICKER}`,
      LOBBY_PICK_LIMIT,
      LOBBY_PICK_WINDOW_MS,
    );
    expect(timeoutSettler.settleFor).toHaveBeenCalledExactlyOnceWith(PICKER);
    expect(em.transactional).toHaveBeenCalledOnce();
    const order = [
      "select user_id from lobby_seekers where id",
      "for no key update",
      "delete from lobby_seekers where id",
      "from game_players where user_id in",
      "delete from lobby_seekers where user_id in (?)",
      "insert into games",
      "insert into game_players",
      "insert into game_players",
    ];
    let cursor = -1;
    for (const part of order) {
      const index = calls.findIndex(({ sql }, i) => i > cursor && sql.includes(part));
      expect(index, part).toBeGreaterThan(cursor);
      cursor = index;
    }
    expect(calls.find(({ sql }) => sql.includes("for no key update"))).toMatchObject({
      sql: expect.stringContaining("order by id"),
      params: [PICKER, OWNER],
    });
    expect(calls.find(({ sql }) => sql.includes("delete from lobby_seekers where id"))!.params).toEqual([
      SEEKER,
      OWNER,
      NOW,
    ]);
    expect(calls.find(({ sql }) => sql.includes("delete from lobby_seekers where id"))!.sql).toContain(
      "expires_at > ?",
    );
    expect(calls.find(({ sql }) => sql.includes("delete from lobby_seekers where user_id in"))).toMatchObject({
      params: [PICKER],
      mode: "run",
    });
    const game = calls.find(({ sql }) => sql.includes("insert into games"))!;
    expect(game.sql).toContain("'lobby', 'active'");
    expect(game.params).toEqual([NOW, NOW, 2]);
    const players = calls.filter(({ sql }) => sql.includes("insert into game_players"));
    expect(players.map(({ params }) => params)).toEqual([
      ["game-new", 1, PICKER, NOW],
      ["game-new", 2, OWNER, NOW],
    ]);
    expect(players[0]!.sql).toContain("true");
    expect(players[0]!.sql).not.toContain("seen_at");
  });

  it("closes the stale slots of the picker before looking at anything", async () => {
    const { service, calls } = setupPick();

    await service.pick(PICKER, SEEKER);

    expect(calls[0]!.sql).toContain("with expired");
  });

  it("answers LOBBY_SEEKER_TAKEN for a seeker with no row (taken, withdrawn or cleaned up), writing nothing", async () => {
    const { service, em } = setupPick({ owner: [] });

    const error = await errorOf(service.pick(PICKER, SEEKER));

    expect(error.status).toBe(409);
    expect(error.code).toBe("LOBBY_SEEKER_TAKEN");
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("refuses to pick oneself with 409 CANNOT_PICK_SELF", async () => {
    const { service, em } = setupPick({ owner: [{ user_id: PICKER }] });

    const error = await errorOf(service.pick(PICKER, SEEKER));

    expect(error.status).toBe(409);
    expect(error.code).toBe("CANNOT_PICK_SELF");
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("answers 401 when the picker was deleted meanwhile", async () => {
    const { service, calls } = setupPick({ locked: [{ id: OWNER }] });

    expect((await errorOf(service.pick(PICKER, SEEKER))).status).toBe(401);
    expect(wrote(calls, "delete from lobby_seekers where id")).toBe(false);
  });

  it("answers LOBBY_SEEKER_TAKEN when the owner account is gone", async () => {
    const { service, calls } = setupPick({ locked: [{ id: PICKER }] });

    const error = await errorOf(service.pick(PICKER, SEEKER));

    expect(error.code).toBe("LOBBY_SEEKER_TAKEN");
    expect(wrote(calls, "delete from lobby_seekers where id")).toBe(false);
  });

  it("answers LOBBY_SEEKER_TAKEN when somebody else took the seeker (the row is gone)", async () => {
    const { service, calls } = setupPick({ taken: [], left: [] });

    const error = await errorOf(service.pick(PICKER, SEEKER));

    expect(error.status).toBe(409);
    expect(error.code).toBe("LOBBY_SEEKER_TAKEN");
    expect(wrote(calls, "insert into games")).toBe(false);
    expect(wrote(calls, "delete from lobby_seekers where user_id in")).toBe(false);
  });

  it("answers LOBBY_SEEKER_EXPIRED when the status ran out before the pick", async () => {
    const { service, calls } = setupPick({ taken: [], left: [{ expired: true }] });

    const error = await errorOf(service.pick(PICKER, SEEKER));

    expect(error.status).toBe(409);
    expect(error.code).toBe("LOBBY_SEEKER_EXPIRED");
    expect(calls.find(({ sql }) => sql.includes("as expired"))!.params).toEqual([NOW, SEEKER]);
    expect(wrote(calls, "insert into games")).toBe(false);
  });

  it("refuses a picker who holds a slot with ACTIVE_GAME_EXISTS and the game (BR-13)", async () => {
    const { service, calls } = setupPick({ pairSlots: [{ game_id: "game-7", user_id: PICKER }] });

    const error = await errorOf(service.pick(PICKER, SEEKER));

    expect(error.status).toBe(409);
    expect(error.code).toBe("ACTIVE_GAME_EXISTS");
    expect(error.data).toEqual({ gameId: "game-7" });
    expect(wrote(calls, "insert into games")).toBe(false);
  });

  it("treats a seeker who holds a slot as taken, without revealing their game", async () => {
    const { service, calls } = setupPick({ pairSlots: [{ game_id: "game-8", user_id: OWNER }] });

    const error = await errorOf(service.pick(PICKER, SEEKER));

    expect(error.code).toBe("LOBBY_SEEKER_TAKEN");
    expect(error.data).toBeUndefined();
    expect(wrote(calls, "insert into games")).toBe(false);
  });

  it("does nothing when the limit is spent", async () => {
    const { service, timeoutSettler, em } = setupPick({
      hit: new TooManyRequestsError("Za dużo prób.", { retryAfterSeconds: 30 }),
    });

    expect((await errorOf(service.pick(PICKER, SEEKER))).status).toBe(429);
    expect(timeoutSettler.settleFor).not.toHaveBeenCalled();
    expect(em.transactional).not.toHaveBeenCalled();
  });
});
