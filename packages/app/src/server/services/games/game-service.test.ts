import {
  CREATE_GAME_LIMIT,
  CREATE_GAME_WINDOW_MS,
  GUEST_TOKEN_GRACE_MS,
  INITIAL_CLOCK_MS,
  INVITATION_TTL_MS,
  READY_DEADLINE_MS,
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
  ACTIVE_GAME_EXISTS_MESSAGE,
  ACTIVE_SLOT_CONSTRAINT,
  GAME_NOT_CANCELLABLE_MESSAGE,
  GAME_NOT_FOUND_MESSAGE,
  GameService,
} from "./game-service";

const NOW = new Date("2026-10-29T12:00:00Z");
const CUTOFF = new Date(NOW.getTime() - READY_DEADLINE_MS);

type Calls = string[];

const EMPTY_BOARD = {
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
  config?: { appOrigin?: string };
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
} = {}) {
  const calls: Calls = [];
  const rows = [...(options.executeRows ?? [])];
  const created: { entity: unknown; data: Record<string, unknown> }[] = [];
  const em = {
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
    execute: vi.fn(async (sql: string) => {
      if (sql.includes("select g.move_count")) {
        calls.push("member");
        return options.member === false ? [] : [{ move_count: options.gamesMoveCount ?? 0 }];
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
    findOneOrFail: vi.fn(async (entity: unknown) => {
      calls.push("findOneOrFail");
      return entity === Game ? { ...EMPTY_BOARD, ...options.game } : options.invitation;
    }),
    find: vi.fn(async () => options.players ?? []),
    findOne: vi.fn(async () => options.player ?? null),
  };
  const rateLimiter = { hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 1 })) };
  const invitationCodes = { generate: vi.fn(() => "ABCDEFGH") };
  const timeoutSettler = {
    settleFor: vi.fn(async () => undefined),
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
  });
  return { service, em, calls, created, rateLimiter, invitationCodes, timeoutSettler };
}

function uniqueViolation(constraint: string) {
  const error = Object.create(UniqueConstraintViolationException.prototype);
  return Object.assign(error, { constraint });
}

describe("GameService.create", () => {
  it("rate limits first, settles timeouts, closes stale games and then inserts", async () => {
    const { service, em, calls, created, rateLimiter, timeoutSettler } = setup();

    const result = await service.create("user-1");

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
    // Q16 and Q21 run inside the transaction, before the new rows are flushed.
    expect(calls).toEqual(["execute:with expired", "execute:with stale", "flush"]);
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.any(String), [NOW, "user-1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(2, expect.any(String), [CUTOFF, "user-1"], "run");

    const expiresAt = new Date(NOW.getTime() + INVITATION_TTL_MS);
    expect(created.map(({ entity }) => entity)).toEqual([Game, GamePlayer, Invitation]);
    expect(created[0]!.data).toEqual({ origin: "invite", status: "waiting", createdAt: NOW });
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
        expiresAt,
      },
    });
  });

  it("falls back to the development origin when APP_ORIGIN is unset", async () => {
    const { service } = setup({ config: {} });
    const result = await service.create("user-1");
    expect(result.invitation.url).toBe("http://localhost:3000/invite/ABCD-EFGH");
  });

  it("stops at the rate limit without touching the database", async () => {
    const { service, em, rateLimiter } = setup();
    rateLimiter.hit.mockRejectedValueOnce(new TooManyRequestsError("slow down"));
    await expect(service.create("user-1")).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("turns the BR-13 index violation into ACTIVE_GAME_EXISTS", async () => {
    const { service } = setup({ flushError: uniqueViolation(ACTIVE_SLOT_CONSTRAINT) });
    await expect(service.create("user-1")).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME_EXISTS",
      message: ACTIVE_GAME_EXISTS_MESSAGE,
    });
  });

  it("does not hide other unique violations or failures", async () => {
    const other = uniqueViolation("invitations_code_unique");
    await expect(setup({ flushError: other }).service.create("user-1")).rejects.toBe(other);
    const boom = new Error("boom");
    await expect(setup({ flushError: boom }).service.create("user-1")).rejects.toBe(boom);
  });
});

describe("GameService.cancel", () => {
  it("cancels a waiting game and frees the slots in one transaction", async () => {
    const { service, em, calls } = setup({ executeRows: [[{ id: "game-1" }]] });

    await service.cancel("user-1", "game-1");

    expect(em.count).toHaveBeenCalledWith(GamePlayer, { game: "game-1", seat: 1, user: "user-1" });
    expect(calls).toEqual(["count", "execute:cancel", "execute:update game_players"]);
    // The same statement voids the invitation, so the page can tell "cancelled" from "expired".
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("update invitations"), ["game-1", NOW]);
    expect(em.execute).toHaveBeenNthCalledWith(2, expect.any(String), ["game-1"], "run");
  });

  it("answers 404 for a stranger or a missing game", async () => {
    const { service, em } = setup({ count: 0 });
    await expect(service.cancel("user-2", "game-1")).rejects.toMatchObject({
      status: 404,
      message: GAME_NOT_FOUND_MESSAGE,
    });
    expect(em.execute).not.toHaveBeenCalled();
  });

  it("answers 409 when the game is not waiting any more and frees nothing", async () => {
    const { service, em } = setup({ executeRows: [[]] });
    await expect(service.cancel("user-1", "game-1")).rejects.toMatchObject({
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
      expect.stringContaining("g.finished_at > ?"),
      ["game-1", HASH, new Date(NOW.getTime() - GUEST_TOKEN_GRACE_MS)],
    );
  });

  it("is null for a token that matches no valid player", async () => {
    const { service } = setup({ executeRows: [[]] });
    expect(await service.findParticipant({ guestTokenHash: HASH }, "game-1")).toBeNull();
  });

  it("falls back to the guest token when the signed-in account does not play there", async () => {
    const { service } = setup({ executeRows: [[{ id: "guest-3" }]] });
    expect(
      await service.findParticipant({ userId: "user-1", guestTokenHash: HASH }, "game-1"),
    ).toEqual({ playerId: "guest-3" });
  });
});

describe("GameService.getState", () => {
  const creator = {
    id: "p1",
    seat: 1,
    kind: "account",
    user: { displayName: "Ala" },
    seenAt: NOW,
  };
  const guest = { id: "p2", seat: 2, kind: "guest", user: null, seenAt: null };
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
        expiresAt: invitation.expiresAt,
      },
    });
  });

  it("hides the invitation from the opponent and names guests as null", async () => {
    const { service } = setup({
      game: { status: "active" },
      players: [creator, guest],
    });
    const state = await service.getState({ playerId: "p2" }, "game-1");
    expect(state.invitation).toBeUndefined();
    expect(state.you).toEqual({ seat: 2, kind: "guest" });
    expect(state.players).toEqual([
      { seat: 1, kind: "account", displayName: "Ala", seen: true },
      { seat: 2, kind: "guest", displayName: null, seen: false },
    ]);
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

  it("has no closing reason while the game is not cancelled", async () => {
    const { service } = setup({ game: { status: "active" }, players: [creator, guest] });
    expect((await service.getState({ playerId: "p1" }, "game-1")).closedReason).toBeUndefined();
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
