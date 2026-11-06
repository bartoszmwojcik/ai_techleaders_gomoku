import { ConflictError, NotFoundError, cellOf, coordsOf, rngFor } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMainThreadBotEngine, type BotEngine, type BotTurn } from "./bot-engine";
import { BotTurnService, botTurnsInFlight } from "./bot-turn-service";
import type { GameMoveService } from "./game-move-service";

const GAME = "game-1";
const BOARD = "0".repeat(225);
const withCell = (cell: number) => BOARD.slice(0, cell) + "1" + BOARD.slice(cell + 1);

/** The bot plays white (seat 2), the player opened with black in the centre: the bot is to move. */
const due = (extra: Record<string, unknown> = {}) => ({
  status: "active",
  variant: "classic",
  black_seat: 1,
  move_count: 1,
  stones_black: withCell(cellOf(7, 7)),
  stones_white: BOARD,
  started: true,
  bot_id: "bot-seat",
  bot_seat: 2,
  bot_level: 2,
  bot_memory_mb: 768,
  bot_depth_cap: 8,
  ...extra,
});

function setup(options: { rows?: unknown[]; play?: () => Promise<unknown>; engine?: BotEngine } = {}) {
  const em = { execute: vi.fn(async () => options.rows ?? [due()]) };
  const play = vi.fn(options.play ?? (async () => ({})));
  const choose = vi.fn((_turn: BotTurn) => cellOf(8, 8));
  const engine = options.engine ?? { choose };
  const service = new BotTurnService({
    em: em as unknown as EntityManager,
    gameMoveService: { play } as unknown as GameMoveService,
    botEngine: engine,
  });
  return { service, em, play, choose };
}

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  botTurnsInFlight().clear();
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => error.mockRestore());

describe("BotTurnService.playDueMove (hosted-bot R1)", () => {
  it("peeks without a lock, computes the move with the frozen strength and the seed of the move, and plays it as the bot", async () => {
    const { service, em, play, choose } = setup();

    await expect(service.playDueMove(GAME)).resolves.toBe("played");

    const [sql, params] = em.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("p.kind = 'bot'");
    expect(sql).not.toContain("for update");
    expect(params).toEqual([GAME]);
    const [turn] = choose.mock.calls[0]!;
    expect(turn).toMatchObject({ level: 2, depthCap: 8, memoryMb: 768, position: { moveCount: 1 } });
    expect(turn.position.black[0]).toBeDefined();
    // R16: the seed depends on the game and the number of the bot's move only.
    expect(turn.rng()).toBe(rngFor(GAME, 2)());
    expect(play).toHaveBeenCalledWith({ playerId: "bot-seat" }, GAME, { x: 8, y: 8, moveNumber: 2 });
    expect(botTurnsInFlight().size).toBe(0);
  });

  it.each([
    ["no game with the bot", []],
    ["a finished game", [due({ status: "finished" })]],
    ["a paper game", [due({ variant: "paper" })]],
    ["a clock that has not started (the player has not opened the game)", [due({ started: false })]],
    ["no colours yet", [due({ black_seat: null })]],
    ["a full board", [due({ move_count: 225 })]],
    ["the player's turn", [due({ move_count: 2 })]],
  ])("does nothing for %s", async (_name, rows) => {
    const { service, play, choose } = setup({ rows });
    await expect(service.playDueMove(GAME)).resolves.toBe("idle");
    expect(choose).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it("plays when the bot has black and moves first", async () => {
    const { service, play } = setup({ rows: [due({ black_seat: 2, move_count: 0, stones_black: BOARD })] });
    await expect(service.playDueMove(GAME)).resolves.toBe("played");
    expect(play.mock.calls[0]![2]).toMatchObject({ moveNumber: 1 });
  });

  it("computes one move per game at a time in the process: a second read meanwhile does nothing", async () => {
    let release!: () => void;
    const { service, play } = setup({ play: () => new Promise((resolve) => (release = () => resolve({}))) });

    const first = service.playDueMove(GAME);
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    await expect(service.playDueMove(GAME)).resolves.toBe("busy");
    expect(botTurnsInFlight().has(GAME)).toBe(true);

    release();
    await expect(first).resolves.toBe("played");
    expect(botTurnsInFlight().has(GAME)).toBe(false);
  });

  it("keeps the set of games in flight on globalThis, shared by every copy of the module", async () => {
    expect(botTurnsInFlight()).toBe(botTurnsInFlight());
    vi.resetModules();
    const copy = await import("./bot-turn-service");
    expect(copy.botTurnsInFlight()).toBe(botTurnsInFlight());
  });

  it.each(["STALE_MOVE", "GAME_FINISHED", "NOT_YOUR_TURN", "GAME_NOT_ACTIVE", "GAME_NOT_STARTED"])(
    "drops the move quietly when it lost the race: %s",
    async (code) => {
      const { service } = setup({ play: async () => Promise.reject(new ConflictError("late", { code })) });
      await expect(service.playDueMove(GAME)).resolves.toBe("lost");
      expect(error).not.toHaveBeenCalled();
      expect(botTurnsInFlight().size).toBe(0);
    },
  );

  it("logs any other failure without the position and frees the game", async () => {
    const { service } = setup({ play: async () => Promise.reject(new NotFoundError("gone")) });
    await expect(service.playDueMove(GAME)).resolves.toBe("failed");
    const [line] = error.mock.calls[0]! as [string];
    expect(JSON.parse(line)).toEqual({ event: "bot.turn_failed", ts: expect.any(String), gameId: GAME, error: "NotFoundError" });
    expect(line).not.toMatch(/stones|0000/);
    expect(botTurnsInFlight().size).toBe(0);
  });

  it("recovers after an interrupted computation: the next read plays the same move (R1, R16)", async () => {
    const engine = createMainThreadBotEngine();
    const crashed = setup({ engine, rows: [due({ bot_level: 1, bot_memory_mb: null, bot_depth_cap: null })], play: async () => Promise.reject(new Error("restart")) });
    await expect(crashed.service.playDueMove(GAME)).resolves.toBe("failed");

    const next = setup({ engine, rows: [due({ bot_level: 1, bot_memory_mb: null, bot_depth_cap: null })] });
    await expect(next.service.playDueMove(GAME)).resolves.toBe("played");

    const [, , lost] = crashed.play.mock.calls[0] as unknown as [unknown, string, { x: number; y: number }];
    const [, , played] = next.play.mock.calls[0] as unknown as [unknown, string, { x: number; y: number }];
    expect(played).toEqual(lost);
    expect(coordsOf(cellOf(played.x, played.y))).toEqual({ x: played.x, y: played.y });
  });
});
