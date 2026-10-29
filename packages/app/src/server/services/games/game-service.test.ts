import {
  CREATE_GAME_LIMIT,
  CREATE_GAME_WINDOW_MS,
  GUEST_TOKEN_GRACE_MS,
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
};

/** Fake `em`: `transactional` runs the callback with the same object as `tx`. */
function setup(options: {
  config?: { appOrigin?: string };
  executeRows?: unknown[][];
  count?: number;
  game?: Record<string, unknown>;
  players?: Record<string, unknown>[];
  invitation?: Record<string, unknown>;
  flushError?: unknown;
  player?: Record<string, unknown>;
} = {}) {
  const calls: Calls = [];
  const rows = [...(options.executeRows ?? [])];
  const created: { entity: unknown; data: Record<string, unknown> }[] = [];
  const em = {
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
    execute: vi.fn(async (sql: string) => {
      calls.push(`execute:${sql.includes("returning id") && sql.includes("update games set") ? "cancel" : sql.trim().split(/\s+/).slice(0, 2).join(" ")}`);
      return rows.shift() ?? [];
    }),
    count: vi.fn(async () => {
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
  };
  const service = new GameService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
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
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("status = 'waiting'"), ["game-1"]);
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
    const { service, em, calls } = setup({
      game: { status: "waiting" },
      players: [creator],
      invitation,
    });

    const state = await service.getState({ playerId: "p1" }, "game-1");

    expect(calls).toEqual([
      "count",
      "execute:with expired",
      "execute:with stale",
      "execute:update game_players",
      "findOneOrFail",
      "findOneOrFail",
    ]);
    expect(em.count).toHaveBeenCalledWith(GamePlayer, { id: "p1", game: "game-1" });
    expect(em.execute).toHaveBeenNthCalledWith(1, expect.any(String), [NOW, "game-1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(2, expect.any(String), [CUTOFF, "game-1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(3, expect.any(String), [NOW, "p1"], "run");
    expect(state).toEqual({
      status: "waiting",
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

  it("does not show the invitation once the game is no longer waiting", async () => {
    const { service } = setup({ game: { status: "cancelled" }, players: [creator] });
    const state = await service.getState({ playerId: "p1" }, "game-1");
    expect(state.status).toBe("cancelled");
    expect(state.invitation).toBeUndefined();
  });

  it("adds the board: moves after `after`, the seat on turn and the result", async () => {
    const { service } = setup({
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

  it("rejects `after` beyond the number of moves", async () => {
    const { service } = setup({ game: { status: "active", blackSeat: 1 }, players: [creator, guest] });
    await expect(service.getState({ playerId: "p1" }, "game-1", 1)).rejects.toMatchObject({ status: 400 });
  });

  it("answers 404 to a non-participant before writing anything", async () => {
    const { service, em } = setup({ count: 0 });
    await expect(service.getState({ playerId: "x" }, "game-1")).rejects.toMatchObject({
      status: 404,
    });
    expect(em.execute).not.toHaveBeenCalled();
  });
});
