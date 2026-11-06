import {
  CREATE_GAME_LIMIT,
  CREATE_GAME_WINDOW_MS,
  GUEST_TOKEN_GRACE_MS,
  INITIAL_CLOCK_MS,
  INVITATION_TTL_MS,
  NotFoundError,
  READY_DEADLINE_MS,
  ServiceUnavailableError,
  TooManyRequestsError,
} from "@gomoku/core";
import {
  Game,
  GamePlayer,
  Invitation,
  UniqueConstraintViolationException,
  User,
  type EntityManager,
} from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import {
  BOT_FIXED_MEMORY_MB,
  BOT_RETRY_AFTER_SECONDS,
  BOT_UNAVAILABLE_MESSAGE,
  ACTIVE_GAME_EXISTS_MESSAGE,
  ACTIVE_SLOT_CONSTRAINT,
  GAME_NOT_CANCELLABLE_MESSAGE,
  GAME_NOT_FOUND_MESSAGE,
  GameService,
  OWN_WAITING_GAME_MESSAGE,
  type GuestCreator,
} from "./game-service";

const NOW = new Date("2026-10-29T12:00:00Z");
const CUTOFF = new Date(NOW.getTime() - READY_DEADLINE_MS);

type Calls = string[];

const EMPTY_BOARD = {
  variant: "classic",
  timeControlMs: INITIAL_CLOCK_MS,
  blackSeat: null,
  moveCount: 0,
  stonesBlack: "0".repeat(225),
  stonesWhite: "0".repeat(225),
  moves: new Uint8Array(0),
  winnerSeat: null,
  endReason: null,
  clockMs1: INITIAL_CLOCK_MS,
  clockMs2: INITIAL_CLOCK_MS,
  turnStartedAt: null,
};

/** Fake `em`: `transactional` runs the callback with the same object as `tx`. */
function setup(options: {
  config?: { appOrigin?: string; botEnabled?: boolean };
  executeRows?: unknown[][];
  count?: number;
  member?: boolean;
  gamesMoveCount?: number;
  game?: Record<string, unknown>;
  players?: Record<string, unknown>[];
  invitation?: Record<string, unknown>;
  flushError?: unknown;
  player?: Record<string, unknown>;
  now?: () => Date;
  userMissing?: boolean;
  paperState?: Record<string, unknown>[];
  paperMoves?: Record<string, unknown>[];
} = {}) {
  const calls: Calls = [];
  const rows = [...(options.executeRows ?? [])];
  const created: { entity: unknown; data: Record<string, unknown> }[] = [];
  const em = {
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
    execute: vi.fn(async (sql: string) => {
      if (sql.includes("coalesce(s.move_count")) {
        calls.push("member");
        return options.member === false ? [] : [{ move_count: options.gamesMoveCount ?? 0 }];
      }
      if (sql.includes("from paper_game_states where")) return options.paperState ?? [];
      if (sql.includes("from paper_moves where")) return options.paperMoves ?? [];
      if (sql.includes("from users where id")) {
        calls.push("execute:lock-user");
        return options.userMissing ? [] : [{ id: "user-1", display_name: "Ala" }];
      }
      calls.push(`execute:${sql.includes("returning id") && sql.includes("update games set") ? "cancel" : sql.trim().split(/\s+/).slice(0, 2).join(" ")}`);
      return rows.shift() ?? [];
    }),
    count: vi.fn(async (entity: unknown) => {
      calls.push("count");
      return options.count ?? 1;
    }),
    create: vi.fn((entity: unknown, data: Record<string, unknown>) => {
      const row = { ...data, id: entity === Game ? "game-1" : undefined };
      created.push({ entity, data });
      return row;
    }),
    getReference: vi.fn((_entity: unknown, id: string) => ({ ref: id })),
    flush: vi.fn(async () => {
      calls.push("flush");
      if (options.flushError) throw options.flushError;
    }),
    findOneOrFail: vi.fn(async (...args: unknown[]) => {
      const entity = args[0];
      calls.push("findOneOrFail");
      return entity === Game ? { ...EMPTY_BOARD, ...options.game } : options.invitation;
    }),
    find: vi.fn(async () => options.players ?? []),
    findOne: vi.fn(async () => options.player ?? null),
  };
  const rateLimiter = { hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 1 })) };
  const invitationCodes = { generate: vi.fn(() => "ABCDEFGH") };
  const colorDraw = { drawBlackSeat: vi.fn(() => 2 as const) };
  const timeoutSettler = {
    settleFor: vi.fn(async () => undefined),
    settleForGuest: vi.fn(async () => undefined),
    settleGame: vi.fn(async () => false),
    settleExpired: vi.fn(async () => false),
  };
  const service = new GameService({
    em: em as unknown as EntityManager,
    clock: { now: options.now ?? (() => NOW) },
    rateLimiter: rateLimiter as never,
    invitationCodes: invitationCodes as never,
    timeoutSettler,
    serverConfig: (options.config ?? { appOrigin: "https://gomoku.test" }) as never,
    colorDraw,
  });
  return { service, em, calls, created, rateLimiter, invitationCodes, timeoutSettler, colorDraw };
}

function uniqueViolation(constraint: string) {
  const error = Object.create(UniqueConstraintViolationException.prototype);
  return Object.assign(error, { constraint });
}

describe("GameService.create", () => {
  it("rate limits first, settles timeouts, closes stale games and then inserts", async () => {
    const { service, em, calls, created, rateLimiter, timeoutSettler } = setup();

    const result = await service.create({ kind: "account", userId: "user-1" });

    expect(rateLimiter.hit).toHaveBeenCalledWith(
      "games-create:user-1",
      CREATE_GAME_LIMIT,
      CREATE_GAME_WINDOW_MS,
    );
    expect(timeoutSettler.settleFor).toHaveBeenCalledWith("user-1");
    expect(rateLimiter.hit.mock.invocationCallOrder[0]).toBeLessThan(
      timeoutSettler.settleFor.mock.invocationCallOrder[0]!,
    );
    expect(timeoutSettler.settleFor.mock.invocationCallOrder[0]).toBeLessThan(
      em.transactional.mock.invocationCallOrder[0]!,
    );
    // The user is locked first (#37), then Q16 and Q21 run inside the transaction, before the
    // new rows are flushed.
    expect(calls).toEqual([
      "execute:lock-user",
      "execute:delete from",
      "execute:with expired",
      "execute:with stale",
      "flush",
    ]);
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("for no key update"), ["user-1"]);
    // Starting a game ends the "looking for a game" status (#25 Q5), right after the user lock.
    expect(em.execute).toHaveBeenNthCalledWith(
      2,
      "delete from lobby_seekers where user_id in (?)",
      ["user-1"],
      "run",
    );
    expect(em.execute).toHaveBeenNthCalledWith(3, expect.any(String), [NOW, "user-1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(4, expect.any(String), [CUTOFF, "user-1"], "run");

    const expiresAt = new Date(NOW.getTime() + INVITATION_TTL_MS);
    expect(created.map(({ entity }) => entity)).toEqual([Game, GamePlayer, Invitation]);
    expect(created[0]!.data).toEqual({
      origin: "invite",
      isPublic: false,
      status: "waiting",
      variant: "classic",
      timeControlMs: INITIAL_CLOCK_MS,
      clockMs1: INITIAL_CLOCK_MS,
      clockMs2: INITIAL_CLOCK_MS,
      createdAt: NOW,
    });
    expect(created[1]!.data).toMatchObject({
      seat: 1,
      kind: "account",
      user: { ref: "user-1" },
      isActive: true,
      joinedAt: NOW,
    });
    expect(em.getReference).toHaveBeenCalledWith(User, "user-1");
    expect(created[2]!.data).toMatchObject({ code: "ABCDEFGH", createdAt: NOW, expiresAt });
    expect(result).toEqual({
      gameId: "game-1",
      invitation: {
        code: "ABCD-EFGH",
        url: "https://gomoku.test/invite/ABCD-EFGH",
        mcpUrl: "https://gomoku.test/api/mcp",
        expiresAt,
      },
    });
  });

  it("makes the game public only when the creator asks for it (BR-40)", async () => {
    const { service, created } = setup();
    await service.create({ kind: "account", userId: "user-1", isPublic: true });
    expect(created[0]!.data).toMatchObject({ origin: "invite", isPublic: true });
  });

  it("answers 401 and creates nothing when the account was deleted meanwhile (#37)", async () => {
    const { service, created, calls } = setup({ userMissing: true });
    await expect(service.create({ kind: "account", userId: "user-1" })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(created).toEqual([]);
    expect(calls).toEqual(["execute:lock-user"]);
  });

  it("falls back to the development origin when APP_ORIGIN is unset", async () => {
    const { service } = setup({ config: {} });
    const result = (await service.create({ kind: "account", userId: "user-1" })) as { invitation: { url: string; mcpUrl: string } };
    expect(result.invitation.url).toBe("http://localhost:3000/invite/ABCD-EFGH");
    expect(result.invitation.mcpUrl).toBe("http://localhost:3000/api/mcp");
  });

  it("stops at the rate limit without touching the database", async () => {
    const { service, em, rateLimiter } = setup();
    rateLimiter.hit.mockRejectedValueOnce(new TooManyRequestsError("slow down"));
    await expect(service.create({ kind: "account", userId: "user-1" })).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("turns the BR-13 index violation into ACTIVE_GAME_EXISTS", async () => {
    const { service } = setup({ flushError: uniqueViolation(ACTIVE_SLOT_CONSTRAINT) });
    await expect(service.create({ kind: "account", userId: "user-1" })).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME_EXISTS",
      message: ACTIVE_GAME_EXISTS_MESSAGE,
    });
  });

  it("does not hide other unique violations or failures", async () => {
    const other = uniqueViolation("invitations_code_unique");
    await expect(setup({ flushError: other }).service.create({ kind: "account", userId: "user-1" })).rejects.toBe(other);
    const boom = new Error("boom");
    await expect(setup({ flushError: boom }).service.create({ kind: "account", userId: "user-1" })).rejects.toBe(boom);
  });
});

describe("GameService.create with the bot (hosted-bot spec)", () => {
  const ON = { appOrigin: "https://gomoku.test", botEnabled: true };
  const HASH = "d".repeat(64);

  it("starts a classic, private game at once: no invitation, the bot in seat 2, the colours drawn (R3, R4)", async () => {
    const { service, created, invitationCodes, colorDraw, calls } = setup({ config: ON });

    const result = await service.create({ kind: "account", userId: "user-1", opponent: { kind: "bot", level: 2 } });

    expect(created.map(({ entity }) => entity)).toEqual([Game, GamePlayer, GamePlayer]);
    expect(created[0]!.data).toEqual({
      origin: "bot",
      isPublic: false,
      status: "active",
      startedAt: NOW,
      blackSeat: 2,
      variant: "classic",
      timeControlMs: INITIAL_CLOCK_MS,
      clockMs1: INITIAL_CLOCK_MS,
      clockMs2: INITIAL_CLOCK_MS,
      createdAt: NOW,
    });
    expect(created[1]!.data).toMatchObject({ seat: 1, kind: "account", isActive: true });
    expect(created[1]!.data).not.toHaveProperty("seenAt");
    // The bot counts as having opened the game: the clock starts with the player's first read.
    expect(created[2]!.data).toEqual({
      game: expect.anything(),
      seat: 2,
      kind: "bot",
      botLevel: 2,
      botMemoryMb: BOT_FIXED_MEMORY_MB,
      botDepthCap: 8,
      isActive: true,
      joinedAt: NOW,
      seenAt: NOW,
    });
    expect(colorDraw.drawBlackSeat).toHaveBeenCalledOnce();
    expect(invitationCodes.generate).not.toHaveBeenCalled();
    // The same closing of stale games and seekers as any create (BR-13).
    expect(calls).toEqual(["execute:lock-user", "execute:delete from", "execute:with expired", "execute:with stale", "flush"]);
    expect(result).toEqual({ gameId: "game-1", opponent: "bot", bot: { level: 2, name: "Bot · poziom 2 · 16 MB" } });
  });

  it("gives level 1 no memory and ignores a variant or a public flag that slipped past the schema", async () => {
    const { service, created } = setup({ config: ON });
    const result = await service.create({
      kind: "account",
      userId: "user-1",
      isPublic: true,
      settings: { variant: "paper", timeControlMs: 60_000 },
      opponent: { kind: "bot", level: 1 },
    });
    expect(created[0]!.data).toMatchObject({ isPublic: false, variant: "classic", timeControlMs: INITIAL_CLOCK_MS });
    expect(created[2]!.data).toMatchObject({ botLevel: 1, botMemoryMb: null, botDepthCap: null });
    expect(result).toEqual({ gameId: "game-1", opponent: "bot", bot: { level: 1, name: "Bot · poziom 1" } });
  });

  it("creates a guest's game with the bot under the same BR-13 checks", async () => {
    const { service, created, calls } = setup({ config: ON, executeRows: [[], [], [], []] });
    const result = await service.create({
      kind: "guest",
      tokenHash: HASH,
      limitKey: "games-create-guest:ip:abc",
      opponent: { kind: "bot", level: 1 },
    });
    expect(created.map(({ entity, data }) => [entity, data.kind])).toEqual([
      [Game, undefined],
      [GamePlayer, "guest"],
      [GamePlayer, "bot"],
    ]);
    expect(calls).toContain("execute:select p.game_id,");
    expect(result).toMatchObject({ opponent: "bot" });
  });

  it.each([
    ["an account", { kind: "account" as const, userId: "user-1" }],
    ["a guest", { kind: "guest" as const, tokenHash: HASH, limitKey: "games-create-guest:ip:abc" }],
  ])("refuses %s with 503 BOT_UNAVAILABLE while BOT_ENABLED is off, before the limit or any write (R19)", async (_name, creator) => {
    const { service, em, rateLimiter } = setup({ config: { appOrigin: "https://gomoku.test" } });
    const error = await service.create({ ...creator, opponent: { kind: "bot", level: 2 } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error).toMatchObject({
      status: 503,
      code: "BOT_UNAVAILABLE",
      message: BOT_UNAVAILABLE_MESSAGE,
      retryAfterSeconds: BOT_RETRY_AFTER_SECONDS,
    });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("still creates a game with a person while the bot is off", async () => {
    const { service, created } = setup();
    await service.create({ kind: "account", userId: "user-1", opponent: { kind: "human" } });
    expect(created.map(({ entity }) => entity)).toEqual([Game, GamePlayer, Invitation]);
  });
});

describe("GameService.create for a guest (E02-S08)", () => {
  const HASH = "c".repeat(64);
  const guest = (extra: Partial<GuestCreator> = {}): GuestCreator => ({
    kind: "guest",
    tokenHash: HASH,
    limitKey: "games-create-guest:ip:abc",
    ...extra,
  });
  const slotRow = (status: string, seat = 1) => [{ game_id: "held-game", status, seat }];
  // Statements of the transaction in order: advisory lock, expire, cancel not started, slot read.
  const withSlot = (...rest: unknown[][]) => [[], [], [], ...rest];

  it("keeps a guest's game private by default and public on request (BR-40)", async () => {
    const first = setup({ executeRows: withSlot([]) });
    await first.service.create(guest());
    expect(first.created[0]!.data).toMatchObject({ isPublic: false });
    const second = setup({ executeRows: withSlot([]) });
    await second.service.create(guest({ isPublic: true }));
    expect(second.created[0]!.data).toMatchObject({ isPublic: true });
  });

  it("limits per address, settles the browser's timeouts, locks the token and inserts the guest", async () => {
    const { service, em, calls, created, rateLimiter, timeoutSettler } = setup({ executeRows: withSlot([]) });

    const result = await service.create(guest({ nickname: "Ala" }));

    expect(rateLimiter.hit).toHaveBeenCalledWith("games-create-guest:ip:abc", CREATE_GAME_LIMIT, CREATE_GAME_WINDOW_MS);
    expect(timeoutSettler.settleForGuest).toHaveBeenCalledWith(HASH);
    expect(timeoutSettler.settleFor).not.toHaveBeenCalled();
    expect(rateLimiter.hit.mock.invocationCallOrder[0]).toBeLessThan(timeoutSettler.settleForGuest.mock.invocationCallOrder[0]!);
    expect(calls).toEqual([
      "execute:select pg_advisory_xact_lock(hashtext(?))",
      "execute:with expired",
      "execute:with stale",
      "execute:select p.game_id,",
      "execute:update game_players",
      "flush",
    ]);
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("pg_advisory_xact_lock"), [HASH], "run");
    expect(em.execute).toHaveBeenNthCalledWith(2, expect.any(String), [NOW, HASH], "run");
    expect(em.execute).toHaveBeenNthCalledWith(3, expect.any(String), [CUTOFF, HASH], "run");
    expect(em.execute).toHaveBeenNthCalledWith(5, expect.stringContaining("set guest_token_hash = null"), [HASH], "run");
    expect(created.map(({ entity }) => entity)).toEqual([Game, GamePlayer, Invitation]);
    expect(created[1]!.data).toMatchObject({
      seat: 1,
      kind: "guest",
      guestTokenHash: HASH,
      nickname: "Ala",
      isActive: true,
      joinedAt: NOW,
    });
    expect(created[1]!.data).not.toHaveProperty("user");
    expect(em.getReference).not.toHaveBeenCalled();
    expect(result).toMatchObject({ gameId: "game-1", invitation: { code: "ABCD-EFGH" } });
  });

  it("stops at the rate limit before anything else", async () => {
    const { service, em, rateLimiter, timeoutSettler } = setup();
    rateLimiter.hit.mockRejectedValueOnce(new TooManyRequestsError("slow down"));
    await expect(service.create(guest())).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(timeoutSettler.settleForGuest).not.toHaveBeenCalled();
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("refuses a browser that has a game in progress, with the game id", async () => {
    const { service, created } = setup({ executeRows: withSlot(slotRow("active", 2)) });
    await expect(service.create(guest({ cancelOwnWaitingGame: true }))).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME_EXISTS",
      data: { gameId: "held-game" },
    });
    expect(created).toEqual([]);
  });

  it("refuses an own waiting game unless asked to cancel it, naming the game", async () => {
    const { service, created } = setup({ executeRows: withSlot(slotRow("waiting")) });
    await expect(service.create(guest())).rejects.toMatchObject({
      status: 409,
      code: "OWN_WAITING_GAME",
      message: OWN_WAITING_GAME_MESSAGE,
      data: { gameId: "held-game" },
    });
    expect(created).toEqual([]);
  });

  it("does not take a waiting game of seat 2 for an own one", async () => {
    // Cannot happen (a joiner makes the game active), but the seat decides, not the status.
    const { service } = setup({ executeRows: withSlot(slotRow("waiting", 2)) });
    await expect(service.create(guest({ cancelOwnWaitingGame: true }))).rejects.toMatchObject({
      code: "ACTIVE_GAME_EXISTS",
    });
  });

  it("cancels the own waiting game and creates the new one in the same transaction", async () => {
    const { service, em, calls, created } = setup({
      executeRows: withSlot(slotRow("waiting"), [{ id: "held-game" }]),
    });
    await service.create(guest({ cancelOwnWaitingGame: true }));
    expect(calls.slice(3)).toEqual([
      "execute:select p.game_id,",
      "execute:cancel",
      "execute:update game_players",
      "execute:update game_players",
      "flush",
    ]);
    expect(em.execute).toHaveBeenNthCalledWith(5, expect.stringContaining("update invitations"), ["held-game", NOW]);
    expect(em.execute).toHaveBeenNthCalledWith(6, expect.any(String), ["held-game"], "run");
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(created.map(({ entity }) => entity)).toEqual([Game, GamePlayer, Invitation]);
  });

  it("refuses when somebody joined the game before it could be cancelled", async () => {
    const { service, created } = setup({ executeRows: withSlot(slotRow("waiting"), []) });
    await expect(service.create(guest({ cancelOwnWaitingGame: true }))).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME_EXISTS",
      data: { gameId: "held-game" },
    });
    expect(created).toEqual([]);
  });

  it("throws a refusal after the transaction, so the lazy closings are not rolled back", async () => {
    const { service, em } = setup({ executeRows: withSlot(slotRow("active", 2)) });
    let committed = false;
    em.transactional.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const out = await fn(em);
      committed = true;
      return out;
    });
    await expect(service.create(guest())).rejects.toMatchObject({ code: "ACTIVE_GAME_EXISTS" });
    expect(committed).toBe(true);
  });

  it("leaves other failures of the insert alone", async () => {
    const boom = new Error("boom");
    const { service } = setup({ executeRows: withSlot([]), flushError: boom });
    await expect(service.create(guest())).rejects.toBe(boom);
  });
});

describe("GameService.cancel", () => {
  it("cancels a waiting game and frees the slots in one transaction", async () => {
    const { service, em, calls } = setup({ executeRows: [[{ id: "game-1" }]] });

    await service.cancel({ playerId: "player-1" }, "game-1");

    expect(em.count).toHaveBeenCalledWith(GamePlayer, { id: "player-1", game: "game-1", seat: 1 });
    expect(calls).toEqual(["count", "execute:cancel", "execute:update game_players"]);
    // The same statement voids the invitation, so the page can tell "cancelled" from "expired".
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("update invitations"), ["game-1", NOW]);
    expect(em.execute).toHaveBeenNthCalledWith(2, expect.any(String), ["game-1"], "run");
  });

  it("answers 404 for a stranger or a missing game", async () => {
    const { service, em } = setup({ count: 0 });
    await expect(service.cancel({ playerId: "player-2" }, "game-1")).rejects.toMatchObject({
      status: 404,
      message: GAME_NOT_FOUND_MESSAGE,
    });
    expect(em.execute).not.toHaveBeenCalled();
  });

  it("answers 409 when the game is not waiting any more and frees nothing", async () => {
    const { service, em } = setup({ executeRows: [[]] });
    await expect(service.cancel({ playerId: "player-1" }, "game-1")).rejects.toMatchObject({
      status: 409,
      code: "GAME_NOT_CANCELLABLE",
      message: GAME_NOT_CANCELLABLE_MESSAGE,
    });
    expect(em.execute).toHaveBeenCalledOnce();
  });
});

describe("GameService.findParticipant", () => {
  const HASH = "b".repeat(64);

  it("finds the account's player in the game", async () => {
    const { service, em } = setup({ player: { id: "player-7" } });
    expect(await service.findParticipant({ userId: "user-1" }, "game-1")).toEqual({
      playerId: "player-7",
    });
    expect(em.findOne).toHaveBeenCalledWith(GamePlayer, { game: "game-1", user: "user-1" });
    expect(em.execute).not.toHaveBeenCalled();
  });

  it("is null for a stranger", async () => {
    const { service } = setup();
    expect(await service.findParticipant({ userId: "user-1" }, "game-1")).toBeNull();
  });

  it("is null without any identity, without asking the database", async () => {
    const { service, em } = setup();
    expect(await service.findParticipant({}, "game-1")).toBeNull();
    expect(em.findOne).not.toHaveBeenCalled();
    expect(em.execute).not.toHaveBeenCalled();
  });

  it("finds a guest by the token hash, valid until one hour after the end (BR-22)", async () => {
    const { service, em } = setup({ executeRows: [[{ id: "guest-3" }]] });
    expect(await service.findParticipant({ guestTokenHash: HASH }, "game-1")).toEqual({
      playerId: "guest-3",
    });
    expect(em.findOne).not.toHaveBeenCalled();
    expect(em.execute).toHaveBeenCalledWith(
      expect.stringContaining("g.finished_at else"),
      ["game-1", HASH, new Date(NOW.getTime() - GUEST_TOKEN_GRACE_MS)],
    );
  });

  it("is null for a token that matches no valid player", async () => {
    const { service } = setup({ executeRows: [[]] });
    expect(await service.findParticipant({ guestTokenHash: HASH }, "game-1")).toBeNull();
  });

  it("finds an agent by its own token hash, with the same lifetime as a guest's (BR-31)", async () => {
    const { service, em } = setup({ executeRows: [[{ id: "agent-9" }]] });
    expect(await service.findParticipant({ agentTokenHash: HASH }, "game-1")).toEqual({
      playerId: "agent-9",
    });
    expect(em.execute).toHaveBeenCalledOnce();
    expect(em.execute).toHaveBeenCalledWith(
      expect.stringMatching(/p\.agent_token_hash = \?.*g\.finished_at else/s),
      ["game-1", HASH, new Date(NOW.getTime() - GUEST_TOKEN_GRACE_MS)],
    );
  });

  it("does not take a guest hash for an agent token, nor the other way round", async () => {
    const { service, em } = setup({ executeRows: [[], []] });
    expect(
      await service.findParticipant({ guestTokenHash: HASH, agentTokenHash: "c".repeat(64) }, "game-1"),
    ).toBeNull();
    const [guestCall, agentCall] = em.execute.mock.calls as unknown as [string, unknown[]][];
    expect(guestCall![0]).toContain("p.guest_token_hash = ?");
    expect(guestCall![0]).not.toContain("agent_token_hash");
    expect(guestCall![1]).toContain(HASH);
    expect(agentCall![0]).toContain("p.agent_token_hash = ?");
    expect(agentCall![0]).not.toContain("guest_token_hash");
    expect(agentCall![1]).toContain("c".repeat(64));
  });

  it("is null for an agent token that matches no valid player", async () => {
    const { service } = setup({ executeRows: [[]] });
    expect(await service.findParticipant({ agentTokenHash: HASH }, "game-1")).toBeNull();
  });

  it("falls back to the guest token when the signed-in account does not play there", async () => {
    const { service } = setup({ executeRows: [[{ id: "guest-3" }]] });
    expect(
      await service.findParticipant({ userId: "user-1", guestTokenHash: HASH }, "game-1"),
    ).toEqual({ playerId: "guest-3" });
  });
});

describe("GameService.closeAudience (E10-S05, BR-43)", () => {
  const closing = (row: Partial<{ status: string; is_public: boolean; closed: boolean }> | null, extra: Parameters<typeof setup>[0] = {}) =>
    setup({
      executeRows: row ? [[{ status: "active", is_public: true, closed: false, ...row }]] : [[]],
      game: { status: "active", isPublic: false, audienceClosedAt: NOW },
      players: [{ id: "p1", seat: 1, kind: "account", displayName: "Ala", seenAt: NOW }],
      ...extra,
    });

  it.each(["active", "finished"])("closes a public %s game, deletes the spectators' messages and returns the state", async (status) => {
    const { service, em, calls } = closing({ status }, { game: { status, isPublic: false, audienceClosedAt: NOW, finishedAt: NOW, endReason: "draw", blackSeat: 1 } });

    const state = await service.closeAudience({ playerId: "p1" }, "game-1");

    expect(em.count).toHaveBeenCalledWith(GamePlayer, { id: "p1", game: "game-1", seat: 1 });
    expect(calls.slice(0, 4)).toEqual(["count", "execute:select status,", "execute:update games", "execute:delete from"]);
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("for update"), ["game-1"]);
    expect(em.execute).toHaveBeenNthCalledWith(2, expect.stringContaining("is_public = false"), [NOW, "game-1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(3, expect.stringContaining("spectator_id is not null"), ["game-1"], "run");
    expect(state).toMatchObject({ audienceClosed: true, you: { seat: 1 } });
    expect(state).not.toHaveProperty("audience");
    expect(state).not.toHaveProperty("canCloseAudience");
  });

  it("is a harmless repeat once closed: nothing is written", async () => {
    const { service, em } = closing({ closed: true, is_public: false });
    expect(await service.closeAudience({ playerId: "p1" }, "game-1")).toMatchObject({ audienceClosed: true });
    expect(em.execute).toHaveBeenCalledOnce();
  });

  it("answers 404 for anybody but the creator and for a game that vanished", async () => {
    const stranger = closing({}, { count: 0 });
    await expect(stranger.service.closeAudience({ playerId: "p2" }, "game-1")).rejects.toMatchObject({ status: 404 });
    expect(stranger.em.execute).not.toHaveBeenCalled();
    const gone = closing(null);
    await expect(gone.service.closeAudience({ playerId: "p1" }, "game-1")).rejects.toMatchObject({ status: 404 });
  });

  it.each(["waiting", "cancelled"])("answers 409 GAME_NOT_ACTIVE for a %s game", async (status) => {
    const { service, em } = closing({ status });
    await expect(service.closeAudience({ playerId: "p1" }, "game-1")).rejects.toMatchObject({ status: 409, code: "GAME_NOT_ACTIVE" });
    expect(em.execute).toHaveBeenCalledOnce();
  });

  it("answers 409 GAME_NOT_PUBLIC for a game that was private from the start", async () => {
    const { service, em } = closing({ is_public: false });
    await expect(service.closeAudience({ playerId: "p1" }, "game-1")).rejects.toMatchObject({ status: 409, code: "GAME_NOT_PUBLIC" });
    expect(em.execute).toHaveBeenCalledOnce();
  });
});

describe("GameService.getState", () => {
  it("lets only the creator of a public game in progress or finished close the audience, and tells both once it is closed", async () => {
    const creator = { id: "p1", seat: 1, kind: "account", displayName: "Ala", seenAt: NOW };
    const other = { id: "p2", seat: 2, kind: "guest", user: null, nickname: null, seenAt: NOW };
    const rows = [[], [], [], [], [{ n: 0 }]];
    const asCreator = setup({ game: { status: "active", isPublic: true }, players: [creator, other], executeRows: rows });
    expect((await asCreator.service.getState({ playerId: "p1" }, "game-1")).canCloseAudience).toBe(true);
    const asOther = setup({ game: { status: "active", isPublic: true }, players: [creator, other], executeRows: [[], [], [], [], [{ n: 0 }]] });
    expect(await asOther.service.getState({ playerId: "p2" }, "game-1")).not.toHaveProperty("canCloseAudience");
    const privateGame = setup({ game: { status: "active", isPublic: false }, players: [creator, other] });
    expect(await privateGame.service.getState({ playerId: "p1" }, "game-1")).not.toHaveProperty("canCloseAudience");
    const closed = setup({ game: { status: "active", isPublic: false, audienceClosedAt: NOW }, players: [creator, other] });
    const state = await closed.service.getState({ playerId: "p2" }, "game-1");
    expect(state.audienceClosed).toBe(true);
    expect(state).not.toHaveProperty("canCloseAudience");
  });

  it("carries the audience of a public game in progress, after the lazy bookkeeping, and nothing otherwise", async () => {
    const pub = setup({
      game: { status: "active", isPublic: true },
      players: [creator, guest],
      executeRows: [[], [], [], [], [{ n: 2 }]],
    });
    expect((await pub.service.getState({ playerId: "p1" }, "game-1")).audience).toEqual({ spectators: 2 });

    const closed = setup({ game: { status: "active", isPublic: false }, players: [creator, guest] });
    expect(await closed.service.getState({ playerId: "p1" }, "game-1")).not.toHaveProperty("audience");
    const done = setup({
      game: { status: "finished", isPublic: true, finishedAt: NOW },
      players: [creator, guest],
    });
    expect(await done.service.getState({ playerId: "p1" }, "game-1")).not.toHaveProperty("audience");
  });

  const creator = {
    id: "p1",
    seat: 1,
    kind: "account",
    displayName: "Ala",
    seenAt: NOW,
  };
  const guest = { id: "p2", seat: 2, kind: "guest", user: null, nickname: null, seenAt: null };
  const invitation = { code: "ABCDEFGH", expiresAt: new Date("2026-10-30T12:00:00Z") };

  it("does the lazy bookkeeping in order and shows the invitation to the creator", async () => {
    const { service, em, calls, timeoutSettler } = setup({
      game: { status: "waiting" },
      players: [creator],
      invitation,
    });

    const state = await service.getState({ playerId: "p1" }, "game-1");

    expect(calls).toEqual([
      "member",
      "execute:with expired",
      "execute:with stale",
      "execute:update games",
      "execute:update game_players",
      "findOneOrFail",
      "findOneOrFail",
    ]);
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.any(String), ["p1", "game-1"]);
    expect(em.execute).toHaveBeenNthCalledWith(2, expect.any(String), [NOW, "game-1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(3, expect.any(String), [CUTOFF, "game-1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(4, expect.stringContaining("turn_started_at is null"), [NOW, "game-1", "p1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(5, expect.stringContaining("set seen_at"), [NOW, "p1"], "run");
    expect(timeoutSettler.settleExpired).toHaveBeenCalledWith("game-1", em, NOW);
    expect(state).toEqual({
      status: "waiting",
      variant: "classic",
      timeControlMs: INITIAL_CLOCK_MS,
      clock: { remainingMs: [INITIAL_CLOCK_MS, INITIAL_CLOCK_MS], running: null, now: NOW.getTime() },
      moveCount: 0,
      blackSeat: null,
      turnSeat: null,
      moves: [],
      result: null,
      you: { seat: 1, kind: "account" },
      players: [{ seat: 1, kind: "account", displayName: "Ala", seen: true }],
      invitation: {
        code: "ABCD-EFGH",
        url: "https://gomoku.test/invite/ABCD-EFGH",
        mcpUrl: "https://gomoku.test/api/mcp",
        expiresAt: invitation.expiresAt,
      },
    });
  });

  it("hides the invitation from the opponent and names a nickname-less guest by the seat", async () => {
    const { service } = setup({
      game: { status: "active" },
      players: [creator, guest],
    });
    const state = await service.getState({ playerId: "p2" }, "game-1");
    expect(state.invitation).toBeUndefined();
    expect(state.you).toEqual({ seat: 2, kind: "guest" });
    expect(state.players).toEqual([
      { seat: 1, kind: "account", displayName: "Ala", seen: true },
      { seat: 2, kind: "guest", displayName: "Gracz 2", seen: false },
    ]);
  });

  it("shows a guest's own nickname, and null only for a deleted account", async () => {
    const { service } = setup({
      game: { status: "active" },
      players: [{ ...creator, displayName: null }, { ...guest, nickname: "Kasia" }],
    });
    const state = await service.getState({ playerId: "p2" }, "game-1");
    expect(state.players.map(({ displayName }) => displayName)).toEqual([null, "Kasia"]);
  });

  it("falls back to the account's current name for a seat without a snapshot", async () => {
    const { service } = setup({
      game: { status: "active" },
      players: [{ ...creator, displayName: null, user: { displayName: "Zed" } }, { ...guest, nickname: "Kasia" }],
    });
    const state = await service.getState({ playerId: "p2" }, "game-1");
    expect(state.players.map(({ displayName }) => displayName)).toEqual(["Zed", "Kasia"]);
  });

  it("names an agent by its kind only, with the model name it declared (BR-31)", async () => {
    const agent = { id: "p2", seat: 2, kind: "agent", user: null, nickname: null, agentName: "claude opus 5.5", seenAt: NOW };
    const named = setup({ game: { status: "active" }, players: [creator, agent] });
    const state = await named.service.getState({ playerId: "p1" }, "game-1");
    expect(state.players[1]).toEqual({
      seat: 2,
      kind: "agent",
      displayName: null,
      agentName: "claude opus 5.5",
      seen: true,
    });
    expect(state.players[0]).not.toHaveProperty("agentName");

    const anonymous = setup({ game: { status: "active" }, players: [creator, { ...agent, agentName: null }] });
    expect((await anonymous.service.getState({ playerId: "p1" }, "game-1")).players[1]).toMatchObject({
      displayName: null,
      agentName: null,
    });
    const unset = setup({ game: { status: "active" }, players: [creator, { ...agent, agentName: undefined }] });
    expect((await unset.service.getState({ playerId: "p1" }, "game-1")).players[1]).toMatchObject({ agentName: null });
  });

  it("names the bot by its level and strength and says so in `bot` (R9)", async () => {
    const bot = { id: "p2", seat: 2, kind: "bot", user: null, nickname: null, botLevel: 2, botMemoryMb: 768, seenAt: NOW };
    const strong = setup({ game: { status: "active", origin: "bot" }, players: [creator, bot] });
    const state = await strong.service.getState({ playerId: "p1" }, "game-1");
    expect(state.players[1]).toEqual({
      seat: 2,
      kind: "bot",
      displayName: "Bot · poziom 2 · 16 MB",
      bot: { level: 2, memoryMb: 768 },
      seen: true,
    });
    expect(state.players[0]).not.toHaveProperty("bot");
    expect(state).not.toHaveProperty("invitation");
    expect(state).not.toHaveProperty("fromRematch");

    const weak = setup({ game: { status: "active", origin: "bot" }, players: [creator, { ...bot, botLevel: 1, botMemoryMb: undefined }] });
    expect((await weak.service.getState({ playerId: "p1" }, "game-1")).players[1]).toMatchObject({
      displayName: "Bot · poziom 1",
      bot: { level: 1, memoryMb: null },
    });
  });

  it("does not show the invitation once the game is no longer waiting, and says it was cancelled", async () => {
    const { service } = setup({
      game: { status: "cancelled" },
      players: [creator],
      invitation: { consumedAt: NOW },
    });
    const state = await service.getState({ playerId: "p1" }, "game-1");
    expect(state.status).toBe("cancelled");
    expect(state.invitation).toBeUndefined();
    expect(state.closedReason).toBe("cancelled");
  });

  it("says an unjoined cancelled game with an untouched invitation expired", async () => {
    const { service } = setup({
      game: { status: "cancelled" },
      players: [creator],
      invitation: { consumedAt: null },
    });
    expect((await service.getState({ playerId: "p1" }, "game-1")).closedReason).toBe("expired");
  });

  it("says a cancelled game with two players was not opened, without reading the invitation", async () => {
    const { service, em } = setup({ game: { status: "cancelled" }, players: [creator, guest] });
    expect((await service.getState({ playerId: "p1" }, "game-1")).closedReason).toBe("not_opened");
    expect(em.findOneOrFail).toHaveBeenCalledTimes(1);
  });

  it("answers 404 when the game was removed under the reader (cleanup of guest-only games)", async () => {
    const { service, em } = setup({ game: { status: "active" }, players: [creator, guest] });

    await service.getState({ playerId: "p1" }, "game-1");

    const options = em.findOneOrFail.mock.calls.find(([entity]) => entity === Game)![2] as {
      failHandler: () => Error;
    };
    expect(options.failHandler()).toBeInstanceOf(NotFoundError);
    expect(options.failHandler().message).toBe(GAME_NOT_FOUND_MESSAGE);
  });

  it("has no closing reason while the game is not cancelled", async () => {
    const { service } = setup({ game: { status: "active" }, players: [creator, guest] });
    expect((await service.getState({ playerId: "p1" }, "game-1")).closedReason).toBeUndefined();
  });

  it("has no rematch while nobody offered one", async () => {
    const { service } = setup({ game: { status: "finished", endReason: "draw" }, players: [creator, guest] });
    expect("rematch" in (await service.getState({ playerId: "p1" }, "game-1"))).toBe(false);
  });

  it("marks a game created by a rematch, and only that one", async () => {
    const made = setup({ game: { status: "active", origin: "rematch" }, players: [creator, guest] });
    expect((await made.service.getState({ playerId: "p1" }, "game-1")).fromRematch).toBe(true);
    const plain = setup({ game: { status: "active", origin: "invite" }, players: [creator, guest] });
    expect("fromRematch" in (await plain.service.getState({ playerId: "p1" }, "game-1"))).toBe(false);
  });

  it("says when a finished game ended, and only for a finished one", async () => {
    const finishedAt = new Date(NOW.getTime() - 60_000);
    const done = setup({ game: { status: "finished", endReason: "draw", finishedAt }, players: [creator, guest] });
    expect((await done.service.getState({ playerId: "p1" }, "game-1")).finishedAt).toEqual(finishedAt);
    const open = setup({ game: { status: "active", finishedAt }, players: [creator, guest] });
    expect("finishedAt" in (await open.service.getState({ playerId: "p1" }, "game-1"))).toBe(false);
  });

  it("shows a rematch offer: pending, expired by the time of the read, and the accepted game", async () => {
    const finished = { status: "finished", endReason: "draw", rematchOfferedBySeat: 2 };
    const expiresAt = new Date(NOW.getTime() + 1000);
    const pending = setup({ game: { ...finished, rematchState: "pending", rematchExpiresAt: expiresAt }, players: [creator, guest] });
    expect((await pending.service.getState({ playerId: "p1" }, "game-1")).rematch).toEqual({
      state: "pending", offeredBySeat: 2, expiresAt, gameId: null,
    });

    const late = setup({ game: { ...finished, rematchState: "pending", rematchExpiresAt: expiresAt }, players: [creator, guest], now: () => new Date(NOW.getTime() + 2000) });
    expect((await late.service.getState({ playerId: "p1" }, "game-1")).rematch?.state).toBe("expired");

    const accepted = setup({ game: { ...finished, rematchState: "accepted", rematchExpiresAt: expiresAt, rematchGame: { id: "game-2" } }, players: [creator, guest] });
    expect((await accepted.service.getState({ playerId: "p1" }, "game-1")).rematch).toMatchObject({ state: "accepted", gameId: "game-2" });
  });

  it("adds the board: moves after `after`, the seat on turn and the result", async () => {
    const { service } = setup({
      gamesMoveCount: 2,
      game: {
        status: "active",
        blackSeat: 2,
        moveCount: 2,
        moves: Uint8Array.from([10, 11]),
      },
      players: [creator, guest],
    });
    const state = await service.getState({ playerId: "p1" }, "game-1", 1);
    expect(state).toMatchObject({ moveCount: 2, blackSeat: 2, turnSeat: 2, moves: [11], result: null });
  });

  it("serves the clock: the player on turn loses the time since the turn began", async () => {
    const { service } = setup({
      game: {
        status: "active",
        blackSeat: 1,
        moveCount: 1,
        moves: Uint8Array.from([10]),
        clockMs1: 590_000,
        clockMs2: 600_000,
        turnStartedAt: new Date(NOW.getTime() - 25_000),
      },
      players: [creator, guest],
    });
    const state = await service.getState({ playerId: "p1" }, "game-1");
    expect(state.clock).toEqual({ remainingMs: [590_000, 575_000], running: 2, now: NOW.getTime() });
  });

  it("computes the clock view at the instant the expiry was settled, not at a later read", async () => {
    let reads = 0;
    const { service } = setup({
      // Every `now()` is a second later than the previous one.
      now: () => new Date(NOW.getTime() + 1000 * reads++),
      game: {
        status: "active",
        blackSeat: 1,
        moveCount: 1,
        moves: Uint8Array.from([10]),
        clockMs1: 600_000,
        clockMs2: 5_000,
        turnStartedAt: new Date(NOW.getTime() - 5_000),
      },
      players: [creator, guest],
    });
    const state = await service.getState({ playerId: "p1" }, "game-1");
    // At the settling instant seat 2 has 5 s - 5 s = 0 left only at `now`; a second read
    // would also show 0 or less, so assert the first read is the one used.
    expect(reads).toBe(1);
    expect(state.clock).toEqual({ remainingMs: [600_000, 0], running: 2, now: NOW.getTime() });
  });

  it("rejects `after` beyond the number of moves without doing the bookkeeping (optimization: no wasted writes)", async () => {
    const { service, em, calls } = setup({ gamesMoveCount: 0, players: [creator, guest] });
    await expect(service.getState({ playerId: "p1" }, "game-1", 1)).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual(["member"]);
    expect(em.execute).toHaveBeenCalledOnce();
  });

  it("stateOf still refuses `after` beyond the number of moves (used after a move)", async () => {
    const { service, em } = setup({ game: { status: "active", blackSeat: 1 }, players: [creator, guest] });
    await expect(service.stateOf(em as never, { playerId: "p1" }, "game-1", 1)).rejects.toMatchObject({ status: 400 });
  });

  it("answers 404 to a non-participant before writing anything", async () => {
    const { service, em, calls } = setup({ member: false });
    await expect(service.getState({ playerId: "x" }, "game-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(calls).toEqual(["member"]);
    expect(em.execute).toHaveBeenCalledOnce();
  });
});

describe("GameService, the paper variant (E11)", () => {
  const PAPER = { variant: "paper", timeControlMs: 120_000 } as const;
  const creator = { id: "p1", seat: 1, kind: "account", displayName: "Ala", seenAt: NOW };
  const guest = { id: "p2", seat: 2, kind: "guest", user: null, nickname: null, seenAt: null };
  const move = (n: number, x: number, seat: number, auto = false) => ({
    move_number: n,
    x,
    y: 50,
    seat,
    is_auto: auto,
    at_ms: NOW.getTime() - 1000 * (10 - n),
  });
  const paperGame = (extra: Record<string, unknown> = {}) => ({
    variant: "paper",
    timeControlMs: 120_000,
    clockMs1: 100_000,
    clockMs2: 90_000,
    ...extra,
  });

  it("creates the paper game with its clock budget and the empty sheet, for an account", async () => {
    const { service, created, em } = setup();
    await service.create({ kind: "account", userId: "user-1", settings: PAPER });
    expect(created[0]!.data).toMatchObject({
      variant: "paper",
      timeControlMs: 120_000,
      clockMs1: 120_000,
      clockMs2: 120_000,
    });
    expect(em.execute).toHaveBeenLastCalledWith(expect.stringContaining("insert into paper_game_states"), ["game-1"], "run");
  });

  it("creates the paper game for a guest and none of the sheet for a classic one", async () => {
    const HASH = "c".repeat(64);
    const rows = [[], [], [], []];
    const paper = setup({ executeRows: rows });
    await paper.service.create({ kind: "guest", tokenHash: HASH, limitKey: "k", settings: PAPER });
    expect(paper.created[0]!.data).toMatchObject({ variant: "paper", timeControlMs: 120_000 });
    expect(paper.em.execute).toHaveBeenLastCalledWith(expect.stringContaining("paper_game_states"), ["game-1"], "run");

    const classic = setup({ executeRows: [[], [], [], []] });
    await classic.service.create({ kind: "guest", tokenHash: HASH, limitKey: "k" });
    expect(classic.created[0]!.data).toMatchObject({ variant: "classic", timeControlMs: INITIAL_CLOCK_MS });
    expect(classic.em.execute).not.toHaveBeenCalledWith(expect.stringContaining("paper_game_states"), expect.anything(), "run");
  });

  it("serves the sheet of a game in progress: moves after `after`, scores and the clock of the automat's opponent", async () => {
    const { service } = setup({
      gamesMoveCount: 3,
      game: paperGame({ status: "active", blackSeat: 1, turnStartedAt: new Date(NOW.getTime() - 5000) }),
      players: [creator, guest],
      paperState: [{ move_count: 3, auto_seat: 2, pending_ms: NOW.getTime() + 1500 }],
      paperMoves: [move(1, 50, 1), move(2, 51, 2), move(3, 52, 1)],
    });
    const state = await service.getState({ playerId: "p1" }, "game-1", 1);
    expect(state).toMatchObject({
      variant: "paper",
      timeControlMs: 120_000,
      moveCount: 3,
      blackSeat: 1,
      turnSeat: 2,
      moves: [],
      result: null,
      paper: { moveCount: 3, autoSeat: 2, scores: [0, 0], autoMoveAt: new Date(NOW.getTime() + 1500).toISOString() },
    });
    expect(state.paper!.moves.map(({ n }) => n)).toEqual([2, 3]);
    // The automat plays seat 2, so the clock of seat 1 runs.
    expect(state.clock).toEqual({ remainingMs: [95_000, 90_000], running: 1, now: NOW.getTime() });
  });

  it("runs the clock of seat 2 when the automat plays seat 1, and of the seat on turn without one", async () => {
    const base = { game: paperGame({ status: "active", blackSeat: 1, turnStartedAt: new Date(NOW.getTime() - 5000) }), players: [creator, guest] };
    const automat = setup({ ...base, paperState: [{ move_count: 2, auto_seat: 1, pending_ms: null }], paperMoves: [move(1, 50, 1), move(2, 51, 2)] });
    expect((await automat.service.getState({ playerId: "p1" }, "game-1")).clock.running).toBe(2);
    const plain = setup({ ...base, paperState: [{ move_count: 1, auto_seat: null, pending_ms: null }], paperMoves: [move(1, 50, 1)] });
    const state = await plain.service.getState({ playerId: "p1" }, "game-1");
    expect(state.clock.running).toBe(2);
    expect(state.paper).toMatchObject({ autoSeat: null, autoMoveAt: null });
  });

  it("has no seat on turn and no clock before the game is active", async () => {
    const { service } = setup({
      game: paperGame({ status: "waiting" }),
      players: [creator],
      invitation: { code: "ABCDEFGH", expiresAt: new Date("2026-10-30T12:00:00Z") },
      paperState: [{ move_count: 0, auto_seat: null, pending_ms: null }],
    });
    const state = await service.getState({ playerId: "p1" }, "game-1");
    expect(state).toMatchObject({ variant: "paper", turnSeat: null, blackSeat: null, result: null });
    expect(state.clock.running).toBeNull();
  });

  it("carries the result with the scores of a finished paper game, and none when no reason is stored", async () => {
    const finished = setup({
      game: paperGame({ status: "finished", blackSeat: 1, winnerSeat: 2, endReason: "points", finishedAt: NOW }),
      players: [creator, guest],
      paperState: [{ move_count: 1, auto_seat: null, pending_ms: null }],
      paperMoves: [move(1, 50, 1)],
    });
    expect((await finished.service.getState({ playerId: "p1" }, "game-1")).result).toEqual({
      winnerSeat: 2,
      reason: "points",
      winLine: null,
      scores: [0, 0],
    });
    const drawn = setup({
      game: paperGame({ status: "finished", blackSeat: 1, winnerSeat: null, endReason: "points", finishedAt: NOW }),
      players: [creator, guest],
      paperState: [{ move_count: 0, auto_seat: null, pending_ms: null }],
    });
    expect((await drawn.service.getState({ playerId: "p1" }, "game-1")).result).toMatchObject({ winnerSeat: null });
    const noReason = setup({
      game: paperGame({ status: "finished", blackSeat: 1, endReason: null }),
      players: [creator, guest],
      paperState: [{ move_count: 0, auto_seat: null, pending_ms: null }],
    });
    expect((await noReason.service.getState({ playerId: "p1" }, "game-1")).result).toBeNull();
  });

  it("rejects `after` beyond the moves of the sheet with 400", async () => {
    const { service } = setup({
      gamesMoveCount: 1,
      game: paperGame({ status: "active", blackSeat: 1 }),
      players: [creator, guest],
      paperState: [{ move_count: 1, auto_seat: null, pending_ms: null }],
      paperMoves: [move(1, 50, 1)],
    });
    await expect(service.getState({ playerId: "p1" }, "game-1", 2)).rejects.toMatchObject({ status: 400 });
  });
});
