import { AppError, ConflictError, GUEST_TOKEN_GRACE_MS, NotFoundError, TooManyRequestsError, cellOf } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { readServerConfig } from "../../config";
import { hashOpaqueToken } from "../../http/opaque-token";
import { AgentGameService } from "./agent-game-service";
import type { GameState } from "./game-service";

const NOW = new Date("2026-10-31T12:00:00Z");
const TOKEN = "k".repeat(43);

type PeekRow = Record<string, unknown>;

const peekRow = (over: PeekRow = {}): PeekRow => ({
  status: "active",
  black_seat: 1,
  move_count: 0,
  clock_ms_1: 600_000,
  clock_ms_2: 600_000,
  seat: 2,
  turn_started_ms: NOW.getTime() - 1000,
  ...over,
});

const stateOf = (over: Partial<GameState> = {}): GameState =>
  ({
    status: "active",
    moveCount: 1,
    blackSeat: 1,
    turnSeat: 2,
    moves: [cellOf(7, 7)],
    result: null,
    clock: { remainingMs: [599_000, 600_000], running: 2, now: NOW.getTime() },
    you: { seat: 2, kind: "agent" },
    players: [
      { seat: 1, kind: "account", displayName: "Ala Kowalska", seen: true },
      { seat: 2, kind: "agent", displayName: null, agentName: "claude", seen: true },
    ],
    ...over,
  }) as GameState;

function setup(
  options: { seat?: { id: string; game_id: string } | null; peeks?: (PeekRow | null)[]; state?: GameState } = {},
) {
  const peeks = options.peeks ?? [];
  let peeked = 0;
  const execute = vi.fn(async (sql: string) => {
    if (sql.includes("agent_token_hash")) {
      return options.seat === null ? [] : [options.seat ?? { id: "agent-1", game_id: "game-1" }];
    }
    const row = peeks[Math.min(peeked, peeks.length - 1)];
    peeked += 1;
    return row ? [row] : [];
  });
  const rateLimiter = { hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 60 })) };
  const gameService = { getState: vi.fn(async () => options.state ?? stateOf()) };
  const gameMoveService = { play: vi.fn(async () => stateOf()) };
  const service = new AgentGameService({
    em: { execute } as unknown as EntityManager,
    clock: { now: () => NOW },
    rateLimiter: rateLimiter as never,
    serverConfig: readServerConfig({ MCP_TOKEN_LIMIT: "7" }),
    gameService: gameService as never,
    gameMoveService: gameMoveService as never,
  });
  const sleep = vi.fn<(ms: number, signal?: AbortSignal) => Promise<void>>(async () => undefined);
  return { service, execute, rateLimiter, gameService, gameMoveService, sleep };
}

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("AgentGameService.getState", () => {
  it("reads the state of the agent's game through GameService and shows it without names", async () => {
    const { service, gameService } = setup();

    const view = await service.getState({ token: TOKEN });

    expect(gameService.getState).toHaveBeenCalledExactlyOnceWith({ playerId: "agent-1" }, "game-1");
    expect(view).toMatchObject({
      status: "active",
      you: { seat: 2, color: "white" },
      opponent: { kind: "account" },
      turn: "you",
      nextMoveNumber: 2,
      moves: [{ n: 1, x: 7, y: 7, color: "black" }],
    });
    expect(JSON.stringify(view)).not.toMatch(/Kowalska|claude|displayName|agentName/);
  });

  it("looks the token up by its hash and counts the limit of that token, after the lookup", async () => {
    const { service, execute, rateLimiter } = setup();

    await service.getState({ token: TOKEN });

    const [sql, params] = execute.mock.calls[0]! as unknown as [string, unknown[]];
    expect(sql).toContain("p.agent_token_hash = ?");
    expect(params).toEqual([hashOpaqueToken(TOKEN), new Date(NOW.getTime() - GUEST_TOKEN_GRACE_MS)]);
    expect(rateLimiter.hit).toHaveBeenCalledExactlyOnceWith(`mcp-token:${hashOpaqueToken(TOKEN)}`, 7, 60_000);
  });

  it.each([
    [undefined, "token"],
    [{ token: "short" }, "token"],
    [{ token: TOKEN, waitSeconds: 26 }, "waitSeconds"],
    [{ token: TOKEN, afterMove: -1 }, "afterMove"],
  ])("refuses the input %j as INVALID_INPUT naming only %s, before touching anything", async (raw, field) => {
    const { service, execute, rateLimiter, gameService } = setup();

    const error = await failure(service.getState(raw));

    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe(`Nieprawidłowe pole: ${field}.`);
    expect(execute).not.toHaveBeenCalled();
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(gameService.getState).not.toHaveBeenCalled();
  });

  it("answers a stranger's token with a missing game and counts nothing", async () => {
    const { service, rateLimiter, gameService } = setup({ seat: null });

    const error = await failure(service.getState({ token: TOKEN }));

    expect(error).toBeInstanceOf(NotFoundError);
    expect(rateLimiter.hit).not.toHaveBeenCalled();
    expect(gameService.getState).not.toHaveBeenCalled();
  });

  it("stops at the limit of the token before any bookkeeping of the game", async () => {
    const { service, rateLimiter, gameService } = setup();
    rateLimiter.hit.mockRejectedValue(new TooManyRequestsError("Za dużo", { retryAfterSeconds: 5 }));

    await expect(service.getState({ token: TOKEN })).rejects.toBeInstanceOf(TooManyRequestsError);

    expect(gameService.getState).not.toHaveBeenCalled();
  });

  it("lists the moves after afterMove and refuses an afterMove beyond the game", async () => {
    const { service } = setup({ state: stateOf({ moveCount: 2, moves: [cellOf(1, 1), cellOf(2, 2)] }) });

    const view = await service.getState({ token: TOKEN, afterMove: 1 });
    const error = await failure(service.getState({ token: TOKEN, afterMove: 3 }));

    expect(view.moves).toEqual([{ n: 2, x: 2, y: 2, color: "white" }]);
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe("Nieprawidłowe pole: afterMove.");
  });

  describe("waitSeconds", () => {
    it("does not wait without it, and treats null as absent", async () => {
      const { service, execute, sleep } = setup();

      await service.getState({ token: TOKEN, waitSeconds: 0 }, { sleep });
      await service.getState({ token: TOKEN, waitSeconds: null }, { sleep });

      expect(sleep).not.toHaveBeenCalled();
      expect(execute.mock.calls.filter(([sql]) => String(sql).includes("turn_started_at"))).toHaveLength(0);
    });

    it("answers at once when it is the agent's turn", async () => {
      const { service, sleep, gameService } = setup({ peeks: [peekRow({ black_seat: 2 })] });

      await service.getState({ token: TOKEN, waitSeconds: 25 }, { sleep });

      expect(sleep).not.toHaveBeenCalled();
      expect(gameService.getState).toHaveBeenCalledOnce();
    });

    it("waits second by second until the opponent has moved, with no transaction open", async () => {
      const { service, sleep, execute } = setup({
        peeks: [peekRow(), peekRow(), peekRow({ move_count: 1 })],
      });

      await service.getState({ token: TOKEN, waitSeconds: 25 }, { sleep });

      expect(sleep).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledWith(1000, undefined);
      expect(execute).toHaveBeenCalledTimes(1 + 3);
    });

    it("gives up after waitSeconds rounds and still reads the state", async () => {
      const { service, sleep, gameService } = setup({ peeks: [peekRow()] });

      await service.getState({ token: TOKEN, waitSeconds: 3 }, { sleep });

      expect(sleep).toHaveBeenCalledTimes(3);
      expect(gameService.getState).toHaveBeenCalledOnce();
    });

    it.each([
      ["the game ended", peekRow({ status: "finished" })],
      ["the game vanished", null],
      ["the colours are not drawn", peekRow({ black_seat: null })],
      [
        "the time of the opponent is up",
        peekRow({ clock_ms_1: 500, turn_started_ms: NOW.getTime() - 1000 }),
      ],
    ])("stops waiting when %s", async (_name, row) => {
      const { service, sleep, gameService } = setup({ peeks: [row] });

      await service.getState({ token: TOKEN, waitSeconds: 25 }, { sleep });

      expect(sleep).not.toHaveBeenCalled();
      expect(gameService.getState).toHaveBeenCalledOnce();
    });

    it("keeps waiting while the clock has not started", async () => {
      const { service, sleep } = setup({ peeks: [peekRow({ turn_started_ms: null })] });

      await service.getState({ token: TOKEN, waitSeconds: 2 }, { sleep });

      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it("stops when the client closes the connection, and passes the signal to the pause", async () => {
      const controller = new AbortController();
      const { service, sleep } = setup({ peeks: [peekRow()] });
      sleep.mockImplementation(async () => controller.abort());

      await service.getState({ token: TOKEN, waitSeconds: 25 }, { sleep, signal: controller.signal });

      expect(sleep).toHaveBeenCalledExactlyOnceWith(1000, controller.signal);
    });

    it("uses the real pause by default", async () => {
      vi.useFakeTimers();
      try {
        const { service } = setup({ peeks: [peekRow()] });
        const pending = service.getState({ token: TOKEN, waitSeconds: 1 });

        await vi.advanceTimersByTimeAsync(1000);

        await expect(pending).resolves.toMatchObject({ status: "active" });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe("AgentGameService.playMove", () => {
  const move = { token: TOKEN, x: 7, y: 8, moveNumber: 2 };

  it("plays through GameMoveService and answers with the whole state", async () => {
    const { service, gameMoveService, gameService, rateLimiter } = setup();

    const view = await service.playMove(move);

    expect(gameMoveService.play).toHaveBeenCalledExactlyOnceWith({ playerId: "agent-1" }, "game-1", {
      x: 7,
      y: 8,
      moveNumber: 2,
    });
    expect(gameService.getState).toHaveBeenCalledExactlyOnceWith({ playerId: "agent-1" }, "game-1");
    expect(view.board).toHaveLength(15);
    expect(rateLimiter.hit).toHaveBeenCalledOnce();
  });

  it.each([
    [undefined, "token"],
    [{ ...move, x: 1.5 }, "x"],
    [{ ...move, y: "3" }, "y"],
    [{ ...move, moveNumber: 0 }, "moveNumber"],
  ])("refuses the input %j as INVALID_INPUT naming %s, without a lookup", async (raw, field) => {
    const { service, execute, gameMoveService } = setup();

    const error = await failure(service.playMove(raw));

    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe(`Nieprawidłowe pole: ${field}.`);
    expect(execute).not.toHaveBeenCalled();
    expect(gameMoveService.play).not.toHaveBeenCalled();
  });

  it("answers a stranger's token before judging the move", async () => {
    const { service, gameMoveService } = setup({ seat: null });

    await expect(service.playMove({ ...move, x: 99 })).rejects.toBeInstanceOf(NotFoundError);

    expect(gameMoveService.play).not.toHaveBeenCalled();
  });

  it.each([
    [-1, 0],
    [15, 0],
    [0, -1],
    [0, 15],
    [99, 99],
  ])("refuses the cell (%i, %i) off the board as ILLEGAL_MOVE without calling the game", async (x, y) => {
    const { service, gameMoveService, gameService } = setup();

    const error = await failure(service.playMove({ ...move, x, y }));

    expect(error.code).toBe("ILLEGAL_MOVE");
    expect(gameMoveService.play).not.toHaveBeenCalled();
    expect(gameService.getState).not.toHaveBeenCalled();
  });

  it("accepts the corners of the board", async () => {
    const { service, gameMoveService } = setup();

    await service.playMove({ ...move, x: 0, y: 0 });
    await service.playMove({ ...move, x: 14, y: 14 });

    expect(gameMoveService.play).toHaveBeenCalledTimes(2);
  });

  it("passes the error of the game on and reads nothing afterwards", async () => {
    const { service, gameMoveService, gameService } = setup();
    gameMoveService.play.mockRejectedValue(new ConflictError("Teraz ruch przeciwnika.", { code: "NOT_YOUR_TURN" }));

    const error = await failure(service.playMove(move));

    expect(error.code).toBe("NOT_YOUR_TURN");
    expect(gameService.getState).not.toHaveBeenCalled();
  });

  it("stops at the limit of the token before the move", async () => {
    const { service, rateLimiter, gameMoveService } = setup();
    rateLimiter.hit.mockRejectedValue(new TooManyRequestsError("Za dużo"));

    await expect(service.playMove(move)).rejects.toBeInstanceOf(TooManyRequestsError);

    expect(gameMoveService.play).not.toHaveBeenCalled();
  });
});
