import { EventEmitter } from "node:events";

import { BOARD_CELLS, DEFAULT_BOT_TIME_LIMITS, cellOf, createBitboard, withStone, type MoveChoice } from "@gomoku/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BOT_FAILURE_GAMES,
  BOT_MAX_FAILURES,
  botFailures,
  createWorkerBotEngine,
  firstFreeCell,
  inlineLevel1,
  type BotTurn,
  type BotWorkerHandle,
} from "./bot-engine";
import type { BotJob, BotWorkerMessage } from "./bot-worker";
import { spawnBotWorker } from "./bot-worker-spawn";
import { ComputeGate } from "./compute-gate";

vi.mock("./bot-worker-spawn", () => ({ spawnBotWorker: vi.fn() }));

const CENTER = cellOf(7, 7);
const position = { black: withStone(createBitboard(), CENTER), white: createBitboard(), moveCount: 1 };

const turn = (extra: Partial<BotTurn> = {}): BotTurn => ({
  gameId: "game-1",
  moveNumber: 2,
  position,
  level: 2,
  depthCap: 8,
  memoryMb: 768,
  remainingClockMs: 600_000,
  ...extra,
});

const choice = (cell: number, depth = 3): MoveChoice => ({ cell, depth, nodes: 10, score: 0, reason: "search", stoppedBy: "completed" });

class FakeWorker extends EventEmitter implements BotWorkerHandle {
  terminate = vi.fn(async () => 1);
  send(message: BotWorkerMessage) {
    this.emit("message", message);
  }
}

function setup({ spawnError, terminateError }: { spawnError?: Error; terminateError?: boolean } = {}) {
  const workers: FakeWorker[] = [];
  const jobs: BotJob[] = [];
  const spawn = vi.fn((job: BotJob) => {
    if (spawnError) throw spawnError;
    const worker = new FakeWorker();
    if (terminateError) worker.terminate.mockRejectedValue(new Error("gone"));
    workers.push(worker);
    jobs.push(job);
    return worker;
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let clock = 0;
  const engine = createWorkerBotEngine({
    limits: DEFAULT_BOT_TIME_LIMITS,
    spawn,
    gate: new ComputeGate(),
    now: () => clock,
    logger,
  });
  return {
    engine,
    spawn,
    workers,
    jobs,
    logger,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

/** Lets the gate start the task: microtasks only, so the fake timers do not move (unlike `vi.waitFor`). */
async function started() {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  botFailures().clear();
});
afterEach(() => vi.useRealTimers());

describe("createWorkerBotEngine (hosted-bot R5, R6)", () => {
  it("sends the job to a thread with the budget of the frozen strength and plays its move", async () => {
    const { engine, workers, jobs, spawn, logger } = setup();
    const move = engine.choose(turn());
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    expect(jobs[0]).toMatchObject({
      kind: "gomoku-bot-job",
      gameId: "game-1",
      moveNumber: 2,
      level: 2,
      budget: { softMs: 1500, ceilingMs: 3000, maxDepth: 8, ttBytes: 16 * 1024 * 1024 },
    });
    expect(jobs[0]!.stop.byteLength).toBe(4);
    workers[0]!.send({ type: "iteration", choice: choice(10) });
    workers[0]!.send({ type: "done", choice: choice(20) });
    await expect(move).resolves.toBe(20);
    expect(JSON.parse(logger.info.mock.calls[0]![0] as string)).toEqual({
      event: "bot_move",
      ts: expect.any(String),
      gameId: "game-1",
      moveNumber: 2,
      level: 2,
      depth: 3,
      nodes: 10,
      stoppedBy: "completed",
      ms: 0,
    });
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    // Events after the move are ignored (the thread's exit after terminate()).
    workers[0]!.emit("exit", 1);
    workers[0]!.emit("error", new Error("late"));
    expect(botFailures().size).toBe(0);
  });

  it("raises the stop flag at the soft target and kills the thread at the ceiling, playing the last iteration", async () => {
    const { engine, workers, jobs, logger } = setup();
    const move = engine.choose(turn());
    await started();
    expect(workers).toHaveLength(1);
    const flag = new Int32Array(jobs[0]!.stop);
    workers[0]!.send({ type: "iteration", choice: choice(30, 5) });
    vi.advanceTimersByTime(1499);
    expect(Atomics.load(flag, 0)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(Atomics.load(flag, 0)).toBe(1);
    vi.advanceTimersByTime(1500);
    await expect(move).resolves.toBe(30);
    workers[0]!.send({ type: "done", choice: choice(31) });
    expect(logger.info).not.toHaveBeenCalled();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(JSON.parse(logger.warn.mock.calls[0]![0] as string)).toMatchObject({
      event: "bot_ceiling",
      gameId: "game-1",
      moveNumber: 2,
      level: 2,
      ceilingMs: 3000,
      depth: 5,
    });
  });

  it("plays level 1 inline at the ceiling when no iteration completed", async () => {
    const { engine, logger } = setup({ terminateError: true });
    const move = engine.choose(turn());
    await started();
    vi.advanceTimersByTime(3000);
    await expect(move).resolves.toBe(inlineLevel1(turn()));
    expect(JSON.parse(logger.warn.mock.calls[0]![0] as string)).toMatchObject({ depth: null });
  });

  it("cuts the budget by the clock, including the time spent waiting for the gate (R6)", async () => {
    const { engine, jobs, tick, workers } = setup();
    const first = engine.choose(turn({ gameId: "a" }));
    const second = engine.choose(turn({ gameId: "b", remainingClockMs: 31_000 }));
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    tick(1000);
    workers[0]!.send({ type: "done", choice: choice(1) });
    await first;
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    expect(jobs[1]!.budget).toMatchObject({ softMs: 1000, ceilingMs: 3000 });
    workers[1]!.send({ type: "done", choice: choice(2) });
    await expect(second).resolves.toBe(2);
  });

  it("asks a level-1 search of the thread when the clock is under a second", async () => {
    const { engine, jobs, workers } = setup();
    const move = engine.choose(turn({ remainingClockMs: 900 }));
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    expect(jobs[0]).toMatchObject({ level: 1, budget: { softMs: 30, ceilingMs: 90 } });
    workers[0]!.send({ type: "done", choice: choice(5) });
    await expect(move).resolves.toBe(5);
  });

  it.each([
    ["an error in the thread", (worker: FakeWorker) => worker.emit("error", new RangeError("heap"))],
    ["an exit without a move", (worker: FakeWorker) => worker.emit("exit", 1)],
  ])("falls back after %s and logs it without the position", async (_name, crash) => {
    const { engine, workers, logger } = setup();
    const move = engine.choose(turn());
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    crash(workers[0]!);
    await expect(move).resolves.toBe(inlineLevel1(turn()));
    const line = logger.error.mock.calls[0]![0] as string;
    expect(JSON.parse(line)).toMatchObject({ event: "bot_engine_error", gameId: "game-1", failures: 1 });
    expect(line).not.toMatch(/black|white|position/);
    expect(botFailures().get("game-1")).toBe(1);
  });

  it("keeps the last completed iteration when the thread dies after it", async () => {
    const { engine, workers } = setup();
    const move = engine.choose(turn());
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    workers[0]!.send({ type: "iteration", choice: choice(44) });
    workers[0]!.emit("error", new Error("boom"));
    await expect(move).resolves.toBe(44);
  });

  it("falls back when the thread cannot even start", async () => {
    const { engine, logger } = setup({ spawnError: new Error("no threads") });
    await expect(engine.choose(turn())).resolves.toBe(inlineLevel1(turn()));
    expect(JSON.parse(logger.error.mock.calls[0]![0] as string)).toMatchObject({ message: "no threads" });
  });

  it("plays level 1 inline to the end of a game after repeated failures", async () => {
    const { engine, spawn } = setup({ spawnError: new Error("no threads") });
    for (let failure = 0; failure < BOT_MAX_FAILURES; failure++) await engine.choose(turn());
    expect(spawn).toHaveBeenCalledTimes(BOT_MAX_FAILURES);
    await expect(engine.choose(turn())).resolves.toBe(inlineLevel1(turn()));
    expect(spawn).toHaveBeenCalledTimes(BOT_MAX_FAILURES);
  });

  it("remembers the failures of a bounded number of games", async () => {
    const { engine } = setup({ spawnError: new Error("no threads") });
    for (let game = 0; game < BOT_FAILURE_GAMES; game++) botFailures().set(`old-${game}`, 1);
    await engine.choose(turn());
    expect(botFailures().size).toBe(BOT_FAILURE_GAMES);
    expect(botFailures().has("old-0")).toBe(false);
    expect(botFailures().get("game-1")).toBe(1);
  });

  it("uses the real spawner, the process-wide gate and the real clock by default", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const worker = new FakeWorker();
    vi.mocked(spawnBotWorker).mockReturnValue(worker as never);
    const move = createWorkerBotEngine({ limits: DEFAULT_BOT_TIME_LIMITS }).choose(turn());
    await started();
    expect(spawnBotWorker).toHaveBeenCalledOnce();
    worker.send({ type: "done", choice: choice(7) });
    await expect(move).resolves.toBe(7);
    expect(info).toHaveBeenCalledOnce();
    info.mockRestore();
    expect(botFailures()).toBe((globalThis as { __gomokuBotFailures?: unknown }).__gomokuBotFailures);
  });
});

describe("inlineLevel1 and firstFreeCell", () => {
  it("answers a level-1 move next to the stones", () => {
    const cell = inlineLevel1(turn());
    expect(cell).not.toBe(CENTER);
    expect(Math.abs((cell % 15) - 7)).toBeLessThanOrEqual(2);
  });

  it("falls back to the first free cell when the engine throws, and -1 on a full board", () => {
    const full = { black: createBitboard().fill(0xff), white: createBitboard(), moveCount: BOARD_CELLS };
    expect(inlineLevel1({ gameId: "g", moveNumber: 1, position: full })).toBe(-1);
    expect(firstFreeCell(position)).toBe(0);
  });
});
