import { SPECTATORS_MAX, cellOf } from "@gomoku/core";
import { Game, GamePlayer, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { hashOpaqueToken } from "../../http/opaque-token";
import { SPECTATORS_FULL_MESSAGE, SpectatorService } from "./spectator-service";

const GAME = "0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978";
const NOW = new Date("2026-11-02T12:00:00.000Z");
const guard = { key: "invitation-lookup:ip:x", limit: 20 };

type Script = {
  target?: { game_id: string } | undefined;
  game?: { status: string; is_public: boolean } | undefined;
  player?: boolean;
  row?: { id: string } | undefined;
  present?: number;
  alive?: { id: string } | undefined;
  stale?: { stale: boolean; can_chat?: boolean } | undefined;
};

type FakeEm = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  transactional: (fn: (tx: unknown) => unknown) => Promise<unknown>;
  findOneOrFail: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
};

/** A fake `em` that answers the SQL of the service by what it asks for. */
function setup(script: Script = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("from invitations i join games g")) return script.target ? [script.target] : [];
    if (sql.includes("select status, is_public from games")) return script.game ? [script.game] : [];
    if (sql.includes("from game_players where game_id")) return script.player ? [{ one: 1 }] : [];
    if (sql.includes("select id from game_spectators") && sql.includes("expires_at")) return script.alive ? [script.alive] : [];
    if (sql.includes("select id from game_spectators")) return script.row ? [script.row] : [];
    if (sql.includes("count(*)")) return [{ n: script.present ?? 0 }];
    if (sql.includes("select last_seen_at <=")) return script.stale ? [{ can_chat: true, ...script.stale }] : [];
    return [];
  });
  const em: FakeEm = {
    execute,
    transactional: async (fn: (tx: unknown) => unknown) => fn(em),
    findOneOrFail: vi.fn(),
    find: vi.fn(),
  };
  const rateLimiter = { hit: vi.fn(async () => undefined), release: vi.fn(async () => undefined) };
  const timeoutSettler = { settleExpired: vi.fn(async () => false) };
  const service = new SpectatorService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    rateLimiter: rateLimiter as never,
    timeoutSettler: timeoutSettler as never,
  });
  return { service, em, execute, calls, rateLimiter, timeoutSettler };
}

const openGame = { target: { game_id: GAME }, game: { status: "active", is_public: true } };
const inserts = (calls: { sql: string; params: unknown[] }[]) => calls.filter((call) => call.sql.includes("insert into game_spectators"));

describe("SpectatorService.join", () => {
  it("makes a visitor a spectator with a fresh token, of which only the hash is stored", async () => {
    const { service, calls } = setup(openGame);

    const result = await service.join("abcd-efgh", {}, { nickname: "Ala" }, guard);

    expect(result.gameId).toBe(GAME);
    expect(result.spectatorToken).toEqual(expect.any(String));
    const [insert] = inserts(calls);
    const hour = new Date(NOW.getTime() + 3600_000);
    expect(insert!.params).toEqual([GAME, null, "Ala", hashOpaqueToken(result.spectatorToken!), NOW, NOW, hour]);
    expect(JSON.stringify(calls.map((call) => call.params))).not.toContain(result.spectatorToken);
    // The lock is taken before anything is counted or written, with a key of its own.
    const lock = calls.findIndex((call) => call.sql.includes("pg_advisory_xact_lock"));
    expect(lock).toBeGreaterThan(-1);
    expect(calls[lock]!.params).toEqual([`spectate:${GAME}`]);
    expect(calls.findIndex((call) => call.sql.includes("count(*)"))).toBeGreaterThan(lock);
  });

  it("makes an account a spectator named by the account: no token, no nickname", async () => {
    const { service, calls } = setup(openGame);

    const result = await service.join("ABCD-EFGH", { userId: "u1" }, {}, guard);

    expect(result).toEqual({ gameId: GAME });
    expect(inserts(calls)[0]!.params).toEqual([GAME, "u1", null, null, NOW, NOW, new Date(NOW.getTime() + 3600_000)]);
  });

  it("refuses a nickname next to an account before any lookup", async () => {
    const { service, rateLimiter } = setup(openGame);

    await expect(service.join("ABCD-EFGH", { userId: "u1" }, { nickname: "Ala" }, guard)).rejects.toMatchObject({
      status: 400,
      fieldErrors: { nickname: ["Nick podaje tylko gość."] },
    });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("counts only the presence of the last 15 s and only this game's alive rows", async () => {
    const { service, calls } = setup(openGame);
    await service.join("ABCD-EFGH", {}, {}, guard);
    const count = calls.find((call) => call.sql.includes("count(*)"))!;
    expect(count.params).toEqual([GAME, NOW, new Date(NOW.getTime() - 15_000)]);
  });

  it("lets the 20th in and turns the 21st away with the message of BR-42, writing nothing", async () => {
    const last = setup({ ...openGame, present: SPECTATORS_MAX - 1 });
    await expect(last.service.join("ABCD-EFGH", {}, {}, guard)).resolves.toMatchObject({ gameId: GAME });

    const full = setup({ ...openGame, present: SPECTATORS_MAX });
    await expect(full.service.join("ABCD-EFGH", {}, {}, guard)).rejects.toMatchObject({
      status: 409,
      code: "SPECTATORS_FULL",
      message: SPECTATORS_FULL_MESSAGE,
    });
    expect(SPECTATORS_FULL_MESSAGE).toBe("Partia ma komplet widzów");
    expect(inserts(full.calls)).toHaveLength(0);
    // A full house is not a failed guess: the attempt goes back to the pool.
    expect(full.rateLimiter.release).toHaveBeenCalled();
  });

  it("lets a returning visitor in, whatever the limit says, and keeps their cookie", async () => {
    const { service, calls } = setup({ ...openGame, row: { id: "s1" }, present: SPECTATORS_MAX });

    const result = await service.join("ABCD-EFGH", { tokenHash: "h".repeat(64) }, {}, guard);

    expect(result).toEqual({ gameId: GAME });
    expect(inserts(calls)).toHaveLength(0);
    expect(calls.some((call) => call.sql.includes("count(*)"))).toBe(false);
    const slide = calls.find((call) => call.sql.startsWith("update game_spectators"))!;
    expect(slide.params).toEqual([NOW, new Date(NOW.getTime() + 3600_000), "s1"]);
    expect(calls.find((call) => call.sql.includes("token_hash = ?"))!.params).toEqual([GAME, "h".repeat(64)]);
  });

  it("lets a returning account in the same way", async () => {
    const { service, calls } = setup({ ...openGame, row: { id: "s2" }, present: SPECTATORS_MAX });
    expect(await service.join("ABCD-EFGH", { userId: "u1" }, {}, guard)).toEqual({ gameId: GAME });
    expect(inserts(calls)).toHaveLength(0);
  });

  it("gives a player of the game their game back and makes no spectator of them", async () => {
    const { service, calls } = setup({ ...openGame, player: true });
    expect(await service.join("ABCD-EFGH", { userId: "u1" }, {}, guard)).toEqual({ gameId: GAME });
    expect(inserts(calls)).toHaveLength(0);
  });

  it.each([
    ["an unknown code", { target: undefined }],
    ["a private game", { target: { game_id: GAME }, game: { status: "active", is_public: false } }],
    ["a game closed to the audience meanwhile", { target: { game_id: GAME }, game: { status: "active", is_public: false } }],
    ["a game that is still waiting", { target: { game_id: GAME }, game: { status: "waiting", is_public: true } }],
    ["a finished game", { target: { game_id: GAME }, game: { status: "finished", is_public: true } }],
    ["a game removed between the two reads", { target: { game_id: GAME }, game: undefined }],
  ] as [string, Script][])("answers the uniform 410 for %s", async (_name, script) => {
    const { service, calls, rateLimiter } = setup(script);
    await expect(service.join("ABCD-EFGH", {}, {}, guard)).rejects.toMatchObject({ status: 410, code: "INVALID_INVITATION" });
    expect(inserts(calls)).toHaveLength(0);
    // A failed guess stays in the pool of Q13.
    expect(rateLimiter.release).toHaveBeenCalledTimes(0);
  });

  it("answers 410 for a malformed code without touching the database", async () => {
    const { service, execute } = setup(openGame);
    await expect(service.join("!!", {}, {}, guard)).rejects.toMatchObject({ status: 410 });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("SpectatorService.find", () => {
  it("finds the spectator of an account, then of a token, only while the access lasts", async () => {
    const byUser = setup({ alive: { id: "s1" } });
    expect(await byUser.service.find({ userId: "u1" }, GAME)).toEqual({ spectatorId: "s1" });
    expect(byUser.calls[0]!.params).toEqual([GAME, "u1", NOW]);

    const byToken = setup({ alive: { id: "s2" } });
    expect(await byToken.service.find({ tokenHash: "h".repeat(64) }, GAME)).toEqual({ spectatorId: "s2" });
    expect(byToken.calls[0]!.params).toEqual([GAME, "h".repeat(64), NOW]);

    // The account wins; the token is only asked when the account is not a spectator.
    const both = setup({ alive: undefined });
    expect(await both.service.find({ userId: "u1", tokenHash: "h".repeat(64) }, GAME)).toBeNull();
    expect(both.calls).toHaveLength(2);
  });

  it("knows nobody without an identity or without a row", async () => {
    const none = setup({});
    expect(await none.service.find({}, GAME)).toBeNull();
    expect(none.execute).not.toHaveBeenCalled();
    expect(await none.service.find({ userId: "u1" }, GAME)).toBeNull();
  });
});

const bits = (cells: number[]) => Array.from({ length: 225 }, (_, cell) => (cells.includes(cell) ? "1" : "0")).join("");
const gameRow = (over: Record<string, unknown> = {}) => ({
  id: GAME,
  status: "active",
  blackSeat: 1,
  moveCount: 2,
  stonesBlack: bits([cellOf(7, 7)]),
  stonesWhite: bits([cellOf(8, 7)]),
  moves: Uint8Array.from([cellOf(7, 7), cellOf(8, 7)]),
  winnerSeat: null,
  endReason: null,
  clockMs1: 590_000,
  clockMs2: 585_000,
  turnStartedAt: new Date("2026-11-02T11:59:50.000Z"),
  finishedAt: null,
  isPublic: true,
  ...over,
});
const seats = [
  { seat: 1, kind: "account", user: { id: "secret-user", email: "ala@example.com", displayName: "Ala" }, displayName: "Ala", seenAt: NOW },
  { seat: 2, kind: "agent", user: null, agentName: "Claude", agentTokenHash: "secret-agent-hash", seenAt: NOW },
];

function readSetup(game: unknown, script: Script = { stale: { stale: false } }) {
  const s = setup(script);
  s.em.findOneOrFail = vi.fn(async () => game);
  s.em.find = vi.fn(async () => seats);
  return s;
}

describe("SpectatorService.getState", () => {
  it("returns the board, both clocks and the names of the seats - and nothing of the players' own", async () => {
    const { service, em, timeoutSettler } = readSetup(gameRow({ isPublic: true }), { stale: { stale: false }, present: 0 });

    const state = await service.getState({ spectatorId: "s1" }, GAME, 1);

    expect(state).toMatchObject({
      status: "active",
      blackSeat: 1,
      turnSeat: 1,
      moveCount: 2,
      moves: [cellOf(8, 7)],
      result: null,
      players: [
        { seat: 1, kind: "account", displayName: "Ala" },
        { seat: 2, kind: "agent", displayName: null, agentName: "Claude" },
      ],
    });
    expect(state.clock).toMatchObject({ remainingMs: [580_000, 585_000], running: 1, now: NOW.getTime() });
    expect(Object.keys(state).sort()).toEqual(["audience", "blackSeat", "canChat", "clock", "moveCount", "moves", "players", "result", "status", "timeControlMs", "turnSeat", "variant"]);
    for (const player of state.players) expect(Object.keys(player)).not.toContain("seen");
    expect(JSON.stringify(state)).not.toMatch(/secret|ala@example|invitation|code|rematch|you/i);
    expect(timeoutSettler.settleExpired).toHaveBeenCalledWith(GAME, em, NOW);
    expect(em.find).toHaveBeenCalledWith(GamePlayer, { game: GAME }, { populate: ["user"], orderBy: { seat: "asc" } });
    expect(em.findOneOrFail).toHaveBeenCalledWith(Game, GAME, { failHandler: expect.any(Function) });
  });

  it("tells whether the spectator may write, and counts the audience of a public game in progress", async () => {
    const named = readSetup(gameRow({ isPublic: true }), { stale: { stale: false }, present: 3 });
    expect(await named.service.getState({ spectatorId: "s1" }, GAME)).toMatchObject({
      canChat: true,
      audience: { spectators: 3 },
    });
    const silent = readSetup(gameRow({ isPublic: true }), { stale: { stale: false, can_chat: false } });
    expect((await silent.service.getState({ spectatorId: "s1" }, GAME)).canChat).toBe(false);
  });

  it("tells a spectator of a game whose creator closed the audience, and shows them nothing of it (BR-43)", async () => {
    const closed = readSetup(gameRow({ isPublic: false }), { stale: { stale: true }, present: 3 });
    await expect(closed.service.getState({ spectatorId: "s1" }, GAME)).rejects.toMatchObject({
      status: 410,
      code: "AUDIENCE_CLOSED",
    });
    expect(closed.em.find).not.toHaveBeenCalled();
  });

  it("has no audience for a finished game", async () => {
    const done = readSetup(gameRow({ isPublic: true, status: "finished", finishedAt: NOW, turnStartedAt: null }), {
      stale: { stale: false },
    });
    expect(await done.service.getState({ spectatorId: "s1" }, GAME)).not.toHaveProperty("audience");
  });

  it("carries the result and the end of a finished game", async () => {
    const finishedAt = new Date("2026-11-02T11:59:59.000Z");
    const { service } = readSetup(
      gameRow({ status: "finished", winnerSeat: 2, endReason: "resignation", finishedAt, turnStartedAt: null }),
    );
    const state = await service.getState({ spectatorId: "s1" }, GAME);
    expect(state).toMatchObject({ status: "finished", finishedAt, result: { winnerSeat: 2, reason: "resignation" } });
  });

  it("does not write the presence on every read: only when the last write is older than 10 s", async () => {
    const fresh = readSetup(gameRow(), { stale: { stale: false } });
    await fresh.service.getState({ spectatorId: "s1" }, GAME);
    expect(fresh.calls.some((call) => call.sql.startsWith("update game_spectators"))).toBe(false);
    expect(fresh.calls[0]!.params).toEqual([new Date(NOW.getTime() - 10_000), "s1", GAME, NOW]);

    const stale = readSetup(gameRow(), { stale: { stale: true } });
    await stale.service.getState({ spectatorId: "s1" }, GAME);
    const slide = stale.calls.find((call) => call.sql.startsWith("update game_spectators"))!;
    expect(slide.params).toEqual([NOW, new Date(NOW.getTime() + 3600_000), "s1"]);
    // Nothing else is written: no game or player row is touched by a spectator's read.
    expect(stale.calls.filter((call) => /^\s*(update|insert|delete)/i.test(call.sql))).toHaveLength(1);
  });

  it("answers 404 for a spectator whose access ended or who watches another game", async () => {
    const { service, em, timeoutSettler } = readSetup(gameRow(), {});
    await expect(service.getState({ spectatorId: "s1" }, GAME)).rejects.toMatchObject({ status: 404 });
    expect(em.findOneOrFail).not.toHaveBeenCalled();
    expect(timeoutSettler.settleExpired).not.toHaveBeenCalled();
  });

  it("answers 404 for a game removed under the reader and 400 for an after beyond the game", async () => {
    const gone = readSetup(gameRow());
    gone.em.findOneOrFail = vi.fn(async (_entity: unknown, _id: unknown, options: { failHandler: () => Error }) => {
      throw options.failHandler();
    });
    await expect(gone.service.getState({ spectatorId: "s1" }, GAME)).rejects.toMatchObject({ status: 404 });

    const beyond = readSetup(gameRow());
    await expect(beyond.service.getState({ spectatorId: "s1" }, GAME, 3)).rejects.toMatchObject({ status: 400 });
  });
});
