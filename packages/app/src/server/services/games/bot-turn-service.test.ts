import { ConflictError, NotFoundError, ValidationError, cellOf, coordsOf, showPauseMs } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inlineLevel1, type BotEngine, type BotTurn } from "./bot-engine";
import { BotTurnService, botTurnsInFlight } from "./bot-turn-service";
import type { GameMoveService } from "./game-move-service";

const GAME = "game-1";
const NOW = new Date("2026-11-06T10:00:00Z");
const BOARD = "0".repeat(225);
const withCell = (cell: number) => BOARD.slice(0, cell) + "1" + BOARD.slice(cell + 1);

/** The bot plays white (seat 2), the player opened with black in the centre: the bot is to move. */
const due = (extra: Record<string, unknown> = {}) => ({
  status: "active",
  origin: "bot",
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
  remaining_ms: 590_000,
  elapsed_ms: 10_000,
  ...extra,
});

const SHOW = { pauseMinMs: 1000, pauseMaxMs: 2000 };

function setup(options: { rows?: unknown[]; play?: () => Promise<unknown>; engine?: BotEngine } = {}) {
  const em = { execute: vi.fn(async () => options.rows ?? [due()]) };
  const play = vi.fn(options.play ?? (async () => ({})));
  const choose = vi.fn<(turn: BotTurn) => Promise<number>>(async () => cellOf(8, 8));
  const engine = options.engine ?? { choose };
  const service = new BotTurnService({
    em: em as unknown as EntityManager,
    gameMoveService: { play } as unknown as GameMoveService,
    botEngine: engine,
    clock: { now: () => NOW },
    serverConfig: { show: { enabled: true, botVsBotEnabled: true, botLevel2Enabled: false, ...SHOW } },
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
    expect(sql).toContain("remaining_ms");
    expect(sql).toContain("elapsed_ms");
    expect(sql).toContain("g.origin");
    expect(params).toEqual([NOW, NOW, GAME]);
    const [turn] = choose.mock.calls[0]!;
    // R16: the seed depends on the game and the number of the bot's move only; R6: the clock left.
    expect(turn).toMatchObject({
      gameId: GAME,
      moveNumber: 2,
      level: 2,
      depthCap: 8,
      memoryMb: 768,
      remainingClockMs: 590_000,
      position: { moveCount: 1 },
    });
    expect(turn.position.black[0]).toBeDefined();
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
    expect((play.mock.calls[0] as unknown[])[2]).toMatchObject({ moveNumber: 1 });
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
    expect(JSON.parse(line)).toEqual({ event: "bot.turn_failed", ts: expect.any(String), gameId: GAME, error: "NotFoundError", code: "NOT_FOUND" });
    expect(line).not.toMatch(/stones|0000/);
    expect(botTurnsInFlight().size).toBe(0);
  });

  it("logs a plain error without a code, and a refused cell with its code", async () => {
    const plain = setup({ play: async () => Promise.reject(new Error("db down")) });
    await expect(plain.service.playDueMove(GAME)).resolves.toBe("failed");
    expect(JSON.parse(error.mock.calls[0]![0] as string)).not.toHaveProperty("code");
    const occupied = setup({ play: async () => Promise.reject(new ValidationError("taken", { code: "CELL_OCCUPIED" })) });
    await expect(occupied.service.playDueMove(GAME)).resolves.toBe("failed");
    expect(JSON.parse(error.mock.calls[1]![0] as string)).toMatchObject({ code: "CELL_OCCUPIED" });
  });

  it("gives the engine no time when the clock reads nothing", async () => {
    const { service, choose } = setup({ rows: [due({ remaining_ms: null })] });
    await service.playDueMove(GAME);
    expect(choose.mock.calls[0]![0].remainingClockMs).toBe(0);
  });

  it("recovers after an interrupted computation: the next read plays the same move (R1, R16)", async () => {
    const engine: BotEngine = { choose: async (turn) => inlineLevel1(turn) };
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

describe("BotTurnService.playDueMove in a show (show-mode \"Driver\", P9)", () => {
  // Both bots of a bot vs bot show: seat 1 and seat 2, each with its own strength.
  const seat1 = (extra: Record<string, unknown> = {}) =>
    due({ origin: "show", bot_id: "bot-1", bot_seat: 1, bot_level: 1, bot_memory_mb: null, bot_depth_cap: null, ...extra });
  const seat2 = (extra: Record<string, unknown> = {}) =>
    due({ origin: "show", bot_id: "bot-2", bot_seat: 2, bot_level: 1, bot_memory_mb: null, bot_depth_cap: null, ...extra });
  const pauseOf = (moveNumber: number) => showPauseMs(GAME, moveNumber, { minMs: SHOW.pauseMinMs, maxMs: SHOW.pauseMaxMs });
  const after = (moveNumber: number) => ({ elapsed_ms: pauseOf(moveNumber) });

  // move_count 2: black is on turn; move_count 1: white is on turn.
  it.each([
    ["seat 1 has black, black on turn", 1, 2, "bot-1"],
    ["seat 1 has black, white on turn", 1, 1, "bot-2"],
    ["seat 2 has black, black on turn", 2, 2, "bot-2"],
    ["seat 2 has black, white on turn", 2, 1, "bot-1"],
  ])("plays as the bot on turn (%s), whichever order the rows come in", async (_name, blackSeat, moveCount, expected) => {
    const rows = [seat1({ black_seat: blackSeat, move_count: moveCount }), seat2({ black_seat: blackSeat, move_count: moveCount })].map(
      (row) => ({ ...row, ...after(moveCount + 1) }),
    );
    for (const order of [rows, [...rows].reverse()]) {
      const { service, play, choose } = setup({ rows: order });
      await expect(service.playDueMove(GAME)).resolves.toBe("played");
      expect((play.mock.calls[0] as unknown[])[0]).toEqual({ playerId: expected });
      expect(choose.mock.calls[0]![0]).toMatchObject({ moveNumber: moveCount + 1, level: 1, depthCap: null, memoryMb: null });
    }
  });

  it("plays as the bot in seat 1 against an agent, and waits for the agent on its turn", async () => {
    const botTurn = setup({ rows: [seat1({ black_seat: 1, move_count: 2, ...after(3) })] });
    await expect(botTurn.service.playDueMove(GAME)).resolves.toBe("played");
    expect((botTurn.play.mock.calls[0] as unknown[])[0]).toEqual({ playerId: "bot-1" });

    const agentTurn = setup({ rows: [seat1({ black_seat: 1, move_count: 1, ...after(2) })] });
    await expect(agentTurn.service.playDueMove(GAME)).resolves.toBe("idle");
    expect(agentTurn.choose).not.toHaveBeenCalled();
  });

  it("waits for the pause counted from the start of the turn, then plays", async () => {
    const pause = pauseOf(2);
    expect(pause).toBeGreaterThanOrEqual(1000);
    expect(pause).toBeLessThanOrEqual(2000);

    const early = setup({ rows: [seat1({ move_count: 1 }), seat2({ move_count: 1, elapsed_ms: pause - 1 })] });
    await expect(early.service.playDueMove(GAME)).resolves.toBe("idle");
    expect(early.choose).not.toHaveBeenCalled();

    const onTime = setup({ rows: [seat1({ move_count: 1 }), seat2({ move_count: 1, elapsed_ms: pause })] });
    await expect(onTime.service.playDueMove(GAME)).resolves.toBe("played");
  });

  it("does not play before the clock starts (no elapsed time)", async () => {
    const { service, choose } = setup({ rows: [seat2({ move_count: 1, started: false, elapsed_ms: null })] });
    await expect(service.playDueMove(GAME)).resolves.toBe("idle");
    const unstarted = setup({ rows: [seat2({ move_count: 1, elapsed_ms: null })] });
    await expect(unstarted.service.playDueMove(GAME)).resolves.toBe("idle");
    expect(choose).not.toHaveBeenCalled();
    expect(unstarted.choose).not.toHaveBeenCalled();
  });

  it("does not wait in a game that is not a show, even right at the start of the turn", async () => {
    const { service } = setup({ rows: [due({ elapsed_ms: 0 })] });
    await expect(service.playDueMove(GAME)).resolves.toBe("played");
  });
});
