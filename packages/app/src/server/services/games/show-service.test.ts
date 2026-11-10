import { INITIAL_CLOCK_MS, type ShowCreateInput } from "@gomoku/core";
import { Game, GamePlayer, type EntityManager } from "@gomoku/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ServerConfig } from "../../config";
import { SHOW_CREATE_LIMIT, SHOW_CREATE_WINDOW_MS, ShowService } from "./show-service";

const GAME = "0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978";
const OTHER = "1c9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978";
const NOW = new Date("2026-11-10T12:00:00.000Z");
const BOT_BOT: ShowCreateInput = { layout: "bot-bot", levels: [1, 1] };

type Row = Record<string, unknown>;

type Script = {
  /** Rows of the "open shows" query, one list per call (the last one repeats). */
  open?: Row[][];
  /** The row of `select status from games where id = ? and origin = 'show'`. */
  show?: Row | undefined;
  /** Rows the end statement returns. */
  ended?: Row[];
  game?: Row;
  players?: Row[];
  flags?: Partial<ServerConfig["show"]>;
  admitted?: Row[];
  capacity?: Row;
};

const SHOW_FLAGS: ServerConfig["show"] = {
  enabled: true,
  botVsBotEnabled: true,
  botLevel2Enabled: false,
  pauseMinMs: 1000,
  pauseMaxMs: 2000,
};

const gameRow = (over: Row = {}): Row => ({
  id: GAME,
  origin: "show",
  variant: "classic",
  timeControlMs: INITIAL_CLOCK_MS,
  status: "active",
  blackSeat: 2,
  moveCount: 0,
  stonesBlack: "0".repeat(225),
  stonesWhite: "0".repeat(225),
  moves: new Uint8Array(),
  winnerSeat: null,
  endReason: null,
  clockMs1: INITIAL_CLOCK_MS,
  clockMs2: INITIAL_CLOCK_MS,
  turnStartedAt: NOW,
  startedAt: NOW,
  finishedAt: null,
  ...over,
});

const botRow = (seat: number, level: number, memoryMb: number | null): Row => ({
  seat,
  kind: "bot",
  botLevel: level,
  botMemoryMb: memoryMb,
  seenAt: NOW,
});

function setup(script: Script = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  let openReads = 0;
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("g.origin = 'show' and g.status in")) {
      const lists = script.open ?? [[]];
      return lists[Math.min(openReads++, lists.length - 1)];
    }
    if (sql.startsWith("select status from games where id = ?")) return script.show ? [script.show] : [];
    if (sql.includes("update games set status = 'cancelled'")) return script.ended ?? [];
    return [];
  });
  const created: { entity: unknown; data: Row }[] = [];
  const em = {
    execute,
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
    create: vi.fn((entity: unknown, data: Row) => {
      created.push({ entity, data });
      return entity === Game ? Object.assign({ id: GAME }, data) : data;
    }),
    flush: vi.fn(async () => undefined),
    findOneOrFail: vi.fn(async (_entity: unknown, _id: unknown, options: { failHandler: () => Error }) => {
      if (!script.game) throw options.failHandler();
      return script.game;
    }),
    find: vi.fn(async () => script.players ?? [botRow(1, 1, null), botRow(2, 2, 768)]),
  };
  const rateLimiter = { hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 0 })) };
  const timeoutSettler = { settleExpired: vi.fn(async () => false), settleGame: vi.fn(async () => false) };
  const botAdmission = {
    admitShow: vi.fn(async () => script.admitted ?? [
      { level: 1, memoryMb: null, depthCap: null },
      { level: 2, memoryMb: 768, depthCap: 8 },
    ]),
    inspect: vi.fn(async () => script.capacity ?? { enabled: true, availableMb: 768, minAvailableMb: 256, activeGames: 0, maxActiveGames: 3 }),
  };
  const service = new ShowService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    rateLimiter: rateLimiter as never,
    timeoutSettler: timeoutSettler as never,
    serverConfig: { show: { ...SHOW_FLAGS, ...script.flags } } as ServerConfig,
    colorDraw: { drawBlackSeat: () => 2 },
    botAdmission: botAdmission as never,
  });
  return { service, em, execute, calls, created, rateLimiter, timeoutSettler, botAdmission };
}

const errorOf = async (promise: Promise<unknown>) => (await promise.catch((e: unknown) => e)) as Record<string, unknown>;
const sqls = (calls: { sql: string }[]) => calls.map(({ sql }) => sql.replace(/\s+/g, " ").trim());

afterEach(() => vi.restoreAllMocks());

describe("ShowService.create (bot vs bot)", () => {
  it("writes an active private show with both bots, the clock running and the colours drawn", async () => {
    const { service, created, rateLimiter, botAdmission, calls } = setup({ flags: { botLevel2Enabled: true } });

    const show = await service.create("admin-1", { layout: "bot-bot", levels: [1, 2] });

    expect(show).toEqual({
      gameId: GAME,
      layout: "bot-bot",
      bots: [
        { seat: 1, name: "Bot · poziom 1", level: 1, tableMb: null },
        { seat: 2, name: "Bot · poziom 2 · 16 MB", level: 2, tableMb: 16 },
      ],
    });
    expect(rateLimiter.hit).toHaveBeenCalledWith("show-create:admin-1", SHOW_CREATE_LIMIT, SHOW_CREATE_WINDOW_MS);
    expect(botAdmission.admitShow).toHaveBeenCalledWith([1, 2]);
    const [game, first, second] = created;
    expect(game!.entity).toBe(Game);
    expect(game!.data).toMatchObject({
      origin: "show",
      isPublic: false,
      status: "active",
      startedAt: NOW,
      turnStartedAt: NOW,
      blackSeat: 2,
      variant: "classic",
      clockMs1: INITIAL_CLOCK_MS,
      clockMs2: INITIAL_CLOCK_MS,
    });
    expect(first).toMatchObject({ entity: GamePlayer, data: { seat: 1, kind: "bot", botLevel: 1, botMemoryMb: null, seenAt: NOW, isActive: true } });
    expect(second).toMatchObject({ entity: GamePlayer, data: { seat: 2, kind: "bot", botLevel: 2, botMemoryMb: 768, botDepthCap: 8 } });
    expect(created).toHaveLength(3);
    // The lock comes before the check of a show in progress, both in the one transaction.
    const order = sqls(calls);
    const lock = order.indexOf("select pg_advisory_xact_lock(hashtext(?))");
    expect(order[0]).toContain("g.origin = 'show' and g.status in ('waiting', 'active')");
    expect(calls[lock]!.params).toEqual(["show:create"]);
    expect(order[lock + 1]).toContain("g.origin = 'show' and g.status in ('waiting', 'active')");
  });

  it("refuses a second show with SHOW_RUNNING and its id before the pool and the admission (review)", async () => {
    const { service, created, timeoutSettler, calls, rateLimiter, botAdmission } = setup({
      open: [[{ id: OTHER }], [{ id: OTHER, status: "active", bots: 2 }]],
    });

    const error = await errorOf(service.create("admin-1", BOT_BOT));

    expect(error).toMatchObject({ status: 409, code: "SHOW_RUNNING", data: { gameId: OTHER } });
    expect(timeoutSettler.settleExpired).toHaveBeenCalledWith(OTHER, expect.anything(), NOW);
    expect(sqls(calls).some((sql) => sql.startsWith("with expired as"))).toBe(true);
    // A running show is never answered as a busy bot, and refusing it costs no attempt of the pool.
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(botAdmission.admitShow).not.toHaveBeenCalled();
    expect(sqls(calls).some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("still refuses under the lock a show created between the early check and the transaction (race)", async () => {
    // Reads of open shows: early check (none), in the transaction (one, settled), then its row.
    const { service, created, rateLimiter } = setup({ open: [[], [{ id: OTHER }], [{ id: OTHER, status: "active", bots: 2 }]] });

    const error = await errorOf(service.create("admin-1", BOT_BOT));

    expect(error).toMatchObject({ status: 409, code: "SHOW_RUNNING", data: { gameId: OTHER } });
    expect(rateLimiter.hit).toHaveBeenCalledOnce();
    expect(created).toHaveLength(0);
  });

  it("creates the show once the open one has ended on its clock", async () => {
    // The early check and the locked one both settle the show that ran out of time.
    const { service, created } = setup({ open: [[{ id: OTHER }], [], [{ id: OTHER }], []] });

    await expect(service.create("admin-1", BOT_BOT)).resolves.toMatchObject({ gameId: GAME });
    expect(created).toHaveLength(3);
  });

  it.each([
    [{ enabled: false }, "disabled"],
    [{ botVsBotEnabled: false }, "bot_vs_bot_disabled"],
  ])("answers 503 SHOW_UNAVAILABLE while a switch is off (%j), before counting anything", async (flags, reason) => {
    const { service, rateLimiter, botAdmission } = setup({ flags });

    expect(await errorOf(service.create("admin-1", BOT_BOT))).toMatchObject({ status: 503, code: "SHOW_UNAVAILABLE", data: { reason } });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(botAdmission.admitShow).not.toHaveBeenCalled();
  });

  it("refuses level 2 in bot vs bot until its switch is on (P17)", async () => {
    const { service, rateLimiter } = setup();

    expect(await errorOf(service.create("admin-1", { layout: "bot-bot", levels: [2, 1] }))).toMatchObject({
      status: 503,
      code: "BOT_UNAVAILABLE",
      data: { reason: "level2_not_allowed" },
    });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("passes on a refusal of the rate limiter and of the bot, writing nothing", async () => {
    const limited = setup();
    limited.rateLimiter.hit.mockRejectedValue(new Error("429"));
    await expect(limited.service.create("admin-1", BOT_BOT)).rejects.toThrow("429");
    expect(limited.botAdmission.admitShow).not.toHaveBeenCalled();

    const busy = setup();
    busy.botAdmission.admitShow.mockRejectedValue(new Error("503"));
    await expect(busy.service.create("admin-1", BOT_BOT)).rejects.toThrow("503");
    // Only the early look at the open shows ran: no lock, no insert.
    expect(busy.em.transactional).toHaveBeenCalledOnce();
    expect(sqls(busy.calls).some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(false);
    expect(busy.created).toHaveLength(0);
  });
});

describe("ShowService.read", () => {
  it("settles in order (expiry, clock, time) and returns the state without seen, with the bots' strength", async () => {
    const { service, calls, timeoutSettler } = setup({ show: { status: "active" }, game: gameRow() });

    const state = await service.read(GAME, 0);

    const order = sqls(calls);
    expect(order[0]).toBe("select status from games where id = ? and origin = 'show'");
    expect(order[1]).toMatch(/^with expired as/);
    expect(order[2]).toContain("update games set turn_started_at = ?");
    expect(order[2]).toContain("origin = 'show'");
    expect(order[2]).not.toContain("p.id <>");
    expect(calls[2]!.params).toEqual([NOW, GAME]);
    expect(timeoutSettler.settleExpired).toHaveBeenCalledWith(GAME, expect.anything(), NOW);
    expect(state).toMatchObject({ status: "active", layout: "bot-bot", turnSeat: 2, blackSeat: 2, moveCount: 0 });
    expect(state.players).toEqual([
      { seat: 1, kind: "bot", displayName: "Bot · poziom 1", bot: { level: 1, memoryMb: null, tableMb: null } },
      { seat: 2, kind: "bot", displayName: "Bot · poziom 2 · 16 MB", bot: { level: 2, memoryMb: 768, tableMb: 16 } },
    ]);
    expect(JSON.stringify(state)).not.toContain("seen");
    expect(state).not.toHaveProperty("closedReason");
    expect(state).not.toHaveProperty("finishedAt");
  });

  it("is a 404 for a game that is not a show, before any write", async () => {
    const { service, calls } = setup({ show: undefined });

    expect(await errorOf(service.read(GAME))).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(calls).toHaveLength(1);
  });

  it("is a 404 when the cleanup removed the game under the reader", async () => {
    const { service } = setup({ show: { status: "active" } });

    expect(await errorOf(service.read(GAME))).toMatchObject({ status: 404 });
  });

  it("refuses an `after` beyond the moves", async () => {
    const { service } = setup({ show: { status: "active" }, game: gameRow() });

    expect(await errorOf(service.read(GAME, 3))).toMatchObject({ status: 400 });
  });

  it("tells a finished show by its end and a cancelled one by whether it had started", async () => {
    const finished = setup({
      show: { status: "finished" },
      game: gameRow({ status: "finished", winnerSeat: 1, endReason: "timeout", finishedAt: NOW, clockMs2: 0 }),
    });
    expect(await finished.service.read(GAME)).toMatchObject({ status: "finished", finishedAt: NOW, result: { winnerSeat: 1, reason: "timeout" } });

    const ended = setup({ show: { status: "cancelled" }, game: gameRow({ status: "cancelled" }) });
    expect(await ended.service.read(GAME)).toMatchObject({ status: "cancelled", closedReason: "ended" });

    const expired = setup({
      show: { status: "cancelled" },
      game: gameRow({ status: "cancelled", startedAt: null, blackSeat: null }),
      players: [botRow(1, 1, null)],
    });
    expect(await expired.service.read(GAME)).toMatchObject({ status: "cancelled", closedReason: "expired", layout: "bot-agent" });
  });

  it("names the layout with an agent and keeps the declared name of the agent", async () => {
    const { service } = setup({
      show: { status: "active" },
      game: gameRow(),
      players: [botRow(1, 1, null), { seat: 2, kind: "agent", agentName: "claude", seenAt: NOW }],
    });

    const state = await service.read(GAME);

    expect(state.layout).toBe("bot-agent");
    expect(state.players[1]).toEqual({ seat: 2, kind: "agent", displayName: null, agentName: "claude" });
  });

  it("keeps a finished show without its end time as it is", async () => {
    const { service } = setup({
      show: { status: "finished" },
      game: gameRow({ status: "finished", winnerSeat: 1, endReason: "timeout", finishedAt: null, clockMs2: 0 }),
    });

    expect(await service.read(GAME)).not.toHaveProperty("finishedAt");
  });
});

describe("ShowService.end", () => {
  it("cancels a show in progress under the row lock and releases its seats", async () => {
    const { service, calls, timeoutSettler } = setup({
      show: { status: "active" },
      ended: [{ id: GAME }],
      game: gameRow({ status: "cancelled" }),
    });

    const state = await service.end(GAME);

    const order = sqls(calls);
    expect(order[0]).toBe("select status from games where id = ? and origin = 'show' for update");
    expect(timeoutSettler.settleGame).toHaveBeenCalledWith(GAME, expect.anything(), NOW);
    expect(order).toContain("update games set status = 'cancelled' where id = ? and origin = 'show' and status in ('waiting', 'active') returning id");
    expect(order).toContain("update game_players set is_active = false where game_id = ? and is_active");
    expect(state).toMatchObject({ status: "cancelled", closedReason: "ended" });
  });

  it("is harmless when repeated: nothing to release, the same answer", async () => {
    const { service, calls } = setup({ show: { status: "cancelled" }, ended: [], game: gameRow({ status: "cancelled" }) });

    await expect(service.end(GAME)).resolves.toMatchObject({ status: "cancelled" });
    expect(sqls(calls).some((sql) => sql.startsWith("update game_players"))).toBe(false);
  });

  it("refuses a finished show with 409 GAME_NOT_ACTIVE after the commit (the settlement stays)", async () => {
    const { service, em } = setup({
      show: { status: "active" },
      game: gameRow({ status: "finished", winnerSeat: 1, endReason: "timeout", finishedAt: NOW, clockMs2: 0 }),
    });

    expect(await errorOf(service.end(GAME))).toMatchObject({ status: 409, code: "GAME_NOT_ACTIVE" });
    // The transaction itself resolved: the refusal is thrown outside it.
    await expect(em.transactional.mock.results[0]!.value).resolves.toEqual({ finished: true });
  });

  it("is a 404 for anything but a show", async () => {
    const { service, timeoutSettler } = setup({ show: undefined });

    expect(await errorOf(service.end(GAME))).toMatchObject({ status: 404 });
    expect(timeoutSettler.settleGame).not.toHaveBeenCalled();
  });
});

describe("ShowService.current and overview", () => {
  it("returns no show without open games, and the newest open one otherwise", async () => {
    expect(await setup().service.current()).toBeNull();
    expect(await setup({ open: [[{ id: OTHER, status: "active", bots: 2 }]] }).service.current()).toEqual({
      gameId: OTHER,
      status: "active",
      layout: "bot-bot",
    });
    expect(await setup({ open: [[{ id: OTHER, status: "waiting", bots: 1 }]] }).service.current()).toMatchObject({ layout: "bot-agent" });
  });

  it("sums up the switches and the cheap checks for two bots of level 1", async () => {
    const { service, botAdmission } = setup();

    const overview = await service.overview();

    expect(botAdmission.inspect).toHaveBeenCalledOnce();
    expect(overview).toEqual({
      enabled: true,
      botVsBotEnabled: true,
      level2Enabled: false,
      current: null,
      preflight: {
        ok: true,
        checks: [
          { id: "show_enabled", ok: true },
          { id: "bot_vs_bot_enabled", ok: true },
          { id: "bot_enabled", ok: true },
          { id: "memory", ok: true, detail: { availableMb: 768, minAvailableMb: 256 } },
          { id: "slot", ok: true, detail: { activeGames: 0, maxActiveGames: 3 } },
          { id: "no_show_running", ok: true },
          { id: "engine", ok: null },
        ],
      },
    });
  });
});

describe("ShowService.preflight", () => {
  it("checks the switch of level 2 only when a bot of level 2 is asked for, and fails on any failed check", async () => {
    const { service } = setup({
      open: [[{ id: OTHER, status: "active", bots: 2 }]],
      capacity: { enabled: false, availableMb: 100, minAvailableMb: 256, activeGames: 3, maxActiveGames: 3 },
    });

    const result = await service.preflight({ layout: "bot-bot", levels: [2, 1] });

    expect(result.ok).toBe(false);
    expect(result.checks.map(({ id, ok }) => [id, ok])).toEqual([
      ["show_enabled", true],
      ["bot_vs_bot_enabled", true],
      ["level2_enabled", false],
      ["bot_enabled", false],
      ["memory", false],
      ["slot", false],
      ["no_show_running", false],
      ["engine", null],
    ]);
  });
});
