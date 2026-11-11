import { BOARD_CELLS, DEFAULT_BOT_TIME_LIMITS, hasStone } from "@gomoku/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BotEngine, BotTurn } from "../server/services/games/bot-engine";
import {
  SHOW_BENCH_MIN_DURATION_MS,
  TUNING_STEPS,
  runShowStep,
  runTuning,
  steadyGrowth,
  type ShowBenchDeps,
  type ShowStep,
} from "./bot-bench-show";

const T1 = TUNING_STEPS[0]!;
const QUICK: ShowStep = { name: "quick", pauseMinMs: 0, pauseMaxMs: 0, l2SoftMs: 1500 };

type Pick = (turn: BotTurn) => number;
const isFree = (turn: BotTurn, cell: number) => !hasStone(turn.position.black, cell) && !hasStone(turn.position.white, cell);
const firstFree = (turn: BotTurn, wanted: (cell: number) => boolean) => {
  for (let cell = 0; cell < BOARD_CELLS; cell++) if (wanted(cell) && isFree(turn, cell)) return cell;
  throw new Error("no cell");
};
/** Black fills row 0 (five after 9 moves), white row 2. */
const fiveInRow: Pick = (turn) => firstFree(turn, (cell) => Math.floor(cell / 15) === (turn.position.moveCount % 2 === 0 ? 0 : 2));
/** A pattern without five in any direction for either colour ((x + 2y) mod 4 < 2 is black, 113 cells): a full board. */
const noFive: Pick = (turn) =>
  firstFree(turn, (cell) => ((cell % 15) + 2 * Math.floor(cell / 15)) % 4 < 2 === (turn.position.moveCount % 2 === 0));

type EngineScript = {
  /** The move's own time (the fake timers move by it). */
  ms?: (turn: BotTurn) => number;
  level?: number;
  pick?: Pick;
  /** Log no `bot_move`: a ceiling (`warn`) or a failure (`error`) instead. */
  silent?: "warn" | "error";
};

function engineOf(script: EngineScript, turns: BotTurn[] = []) {
  return (logger: Pick<Console, "info" | "warn" | "error">): BotEngine => ({
    choose: async (turn) => {
      turns.push(turn);
      const ms = script.ms?.(turn) ?? 1000;
      await new Promise((resolve) => setTimeout(resolve, ms));
      if (script.silent) logger[script.silent]("{}");
      else logger.info(JSON.stringify({ event: "bot_move", ms, level: script.level ?? 2, depth: 4, stoppedBy: "soft" }));
      return (script.pick ?? fiveInRow)(turn);
    },
  });
}

function depsOf(over: Partial<ShowBenchDeps> & { engine?: EngineScript; p99Ms?: number } = {}) {
  const turns: BotTurn[] = [];
  const histogram = { enable: vi.fn(), disable: vi.fn(), percentile: vi.fn((p: number) => (p === 99 ? (over.p99Ms ?? 20) : 5) * 1e6), max: 80e6 };
  const deps: ShowBenchDeps = {
    durationMs: SHOW_BENCH_MIN_DURATION_MS,
    memory: { availableMb: 768, source: "fixed" },
    limits: DEFAULT_BOT_TIME_LIMITS,
    createEngine: engineOf(over.engine ?? {}, turns),
    createHistogram: () => histogram as never,
    rssMb: () => 100,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...over,
  };
  return { deps, turns, histogram };
}

/** Runs to the end on the fake timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => vi.useFakeTimers({ now: 0 }));
afterEach(() => vi.useRealTimers());

describe("runShowStep (show-mode P17)", () => {
  it("plays bot vs bot of level 2 as a show — the pause, then the search with the show's limits — and passes a good step", async () => {
    let computing = false;
    const probe = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, computing ? 8 : 5));
    });
    const { deps, turns, histogram } = depsOf({
      probe,
      engine: {
        ms: () => {
          computing = true;
          setTimeout(() => (computing = false), 1000);
          return 1000;
        },
      },
    });

    const result = await settle(runShowStep(T1, deps));

    expect(histogram.enable).toHaveBeenCalledOnce();
    expect(histogram.disable).toHaveBeenCalledOnce();
    expect(turns[0]).toMatchObject({
      gameId: "show-bench-1",
      moveNumber: 1,
      level: 2,
      depthCap: 8,
      memoryMb: 768,
      limits: { 2: { softMs: 1500, ceilingMs: 3000 } },
      position: { moveCount: 0 },
    });
    // The pause (1000-2000 ms) and the search are charged to the clock of the bot.
    expect(turns[0]!.remainingClockMs).toBeLessThanOrEqual(599_000);
    expect(turns[0]!.remainingClockMs).toBeGreaterThanOrEqual(598_000);
    expect(result.games).toBeGreaterThan(5);
    expect(result.ends.five).toBe(result.games - 1);
    expect(result.ends.unfinished).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(300_000);
    expect(result.moveMs).toEqual({ p50: 1000, p95: 1000, max: 1000 });
    expect(result.level1Moves).toBe(0);
    expect(result.depth).toEqual({ p50: 4, max: 4 });
    expect(result.stoppedBy).toEqual({ soft: result.moves });
    expect(result.limits).toEqual({ softMs: 1500, ceilingMs: 3000 });
    expect(result.strength).toEqual({ memoryMb: 768, depthCap: 8 });
    expect(result.eventLoopDelayMs).toEqual({ p50: 5, p99: 20, max: 80 });
    expect(result.otherGameRead!.baselineMs.p95).toBe(5);
    expect(result.otherGameRead!.duringMs.p95).toBe(8);
    // Twice a second, start to start.
    expect(result.otherGameRead!.reads).toBeGreaterThanOrEqual(590);
    expect(result.otherGameRead!.reads).toBeLessThanOrEqual(610);
    // RSS at the start, every minute and at the end.
    expect(result.rssMb.length).toBeGreaterThanOrEqual(6);
    expect(result.rssMb[0]).toEqual({ atS: 0, mb: 100 });
    expect(result.p17).toEqual({
      durationAtLeast300s: true,
      eventLoopP99Within50Ms: true,
      p95WithinSoftTarget: true,
      maxWithinCeiling: true,
      otherGameReadWithin2xAnd300Ms: true,
      rssGrowthWithin100MbAndNotSteady: true,
      noFailedOrInterruptedMoves: true,
    });
    expect(result.accepted).toBe(true);
  });

  it("fails every criterion it can: short, a slow loop, slow moves, a slow probe, growing memory, ceilings and failures", async () => {
    let rss = 100;
    let computing = false;
    const probe = async () => {
      await new Promise((resolve) => setTimeout(resolve, computing ? 400 : 10));
    };
    let count = 0;
    const { deps } = depsOf({
      durationMs: 240_000,
      p99Ms: 60,
      probe,
      rssMb: () => (rss += 30),
      engine: {
        ms: () => {
          computing = true;
          setTimeout(() => (computing = false), 3400);
          return 3400;
        },
      },
    });
    const engine = deps.createEngine;
    deps.createEngine = (logger) => {
      const inner = engine(logger);
      return {
        choose: async (turn) => {
          count++;
          if (count === 2) logger.warn("{}");
          if (count === 3) logger.error("{}");
          return inner.choose(turn);
        },
      };
    };

    const result = await settle(runShowStep(T1, deps));

    expect(result.ceilings).toBe(1);
    expect(result.failures).toBe(1);
    expect(result.rssSteadyGrowth).toBe(true);
    expect(result.p17).toEqual({
      durationAtLeast300s: false,
      eventLoopP99Within50Ms: false,
      p95WithinSoftTarget: false,
      maxWithinCeiling: false,
      otherGameReadWithin2xAnd300Ms: false,
      rssGrowthWithin100MbAndNotSteady: false,
      noFailedOrInterruptedMoves: false,
    });
    expect(result.accepted).toBe(false);
  });

  it("fails a probe within 2x its baseline but over 300 ms, and measures the moves of level 2 only", async () => {
    let computing = false;
    const probe = async () => {
      await new Promise((resolve) => setTimeout(resolve, computing ? 320 : 200));
    };
    const { deps } = depsOf({
      probe,
      durationMs: 300_000,
      engine: {
        level: 1,
        ms: () => {
          computing = true;
          setTimeout(() => (computing = false), 1000);
          return 1000;
        },
      },
    });
    const result = await settle(runShowStep(QUICK, deps));
    expect(result.p17.otherGameReadWithin2xAnd300Ms).toBe(false);
    expect(result.level1Moves).toBe(result.moves);
    expect(result.moveMs).toEqual({ p50: 0, p95: 0, max: 0 });
  });

  it("takes the time of a move that logged nothing (a fallback) and leaves the probe out without a URL", async () => {
    const { deps } = depsOf({ durationMs: 10_000, engine: { silent: "error", ms: () => 700 } });
    const result = await settle(runShowStep(QUICK, deps));
    expect(result.moveMs.max).toBe(700);
    expect(result.stoppedBy).toEqual({ fallback: result.moves });
    expect(result.failures).toBe(result.moves);
    expect(result.otherGameRead).toBeNull();
    expect(result.p17.otherGameReadWithin2xAnd300Ms).toBeNull();
    expect(result.rssSteadyGrowth).toBe(false);
  });

  it("ends a game on a full board and on a clock run out, clipping the pause to a quarter of the clock", async () => {
    const full = depsOf({ durationMs: 3000, engine: { pick: noFive, ms: () => 10 } });
    const filled = await settle(runShowStep(QUICK, full.deps));
    expect(filled.ends.full).toBeGreaterThan(0);
    expect(full.turns.filter((turn) => turn.gameId === "show-bench-1")).toHaveLength(BOARD_CELLS);

    // 290 s a move: the third move of black runs its clock out. Pause 8 s, clipped to clock / 4 once the clock is low
    // (4000 ms left: 1000 ms of pause).
    const slow = depsOf({ durationMs: 2_000_000, engine: { ms: () => 290_000 } });
    const timedOut = await settle(runShowStep({ name: "slow", pauseMinMs: 8000, pauseMaxMs: 8000, l2SoftMs: 1500 }, slow.deps));
    expect(timedOut.ends.timeout).toBeGreaterThan(0);
    const blackMoves = slow.turns.filter((turn) => turn.gameId === "show-bench-1" && turn.position.moveCount % 2 === 0);
    expect(blackMoves.map((turn) => turn.remainingClockMs)).toEqual([592_000, 294_000, 3000]);
  });

  it("refuses to run with too little memory for the bot", async () => {
    const { deps } = depsOf({ memory: { availableMb: 10, source: "fixed" } });
    await expect(runShowStep(T1, deps)).rejects.toThrow("Too little memory for the bot: 10 MB");
  });
});

describe("steadyGrowth (P17: no steady growth of RSS in the last 2 minutes)", () => {
  it("needs three samples of the last two minutes, each above the one before by more than 1 MB", () => {
    expect(steadyGrowth([])).toBe(false);
    expect(steadyGrowth([{ atMs: 0, mb: 1 }, { atMs: 60_000, mb: 5 }])).toBe(false);
    expect(steadyGrowth([{ atMs: 0, mb: 1 }, { atMs: 60_000, mb: 5 }, { atMs: 120_000, mb: 9 }])).toBe(true);
    expect(steadyGrowth([{ atMs: 0, mb: 1 }, { atMs: 60_000, mb: 5 }, { atMs: 120_000, mb: 5.5 }])).toBe(false);
    // An old sample outside the window does not count.
    expect(steadyGrowth([{ atMs: 0, mb: 1 }, { atMs: 200_000, mb: 5 }, { atMs: 260_000, mb: 9 }])).toBe(false);
  });
});

describe("runTuning (show-mode P17: T1 → T2 → T3 until the first that passes)", () => {
  // A move slower than 1.2 × the soft target of T1, and well within it for the slower steps.
  const bySoft = (turn: BotTurn) => (turn.limits![2].softMs === 1500 ? 2000 : turn.limits![2].softMs);

  it("stops at the first step that passes", async () => {
    const { deps } = depsOf({ engine: { ms: bySoft } });
    const result = await settle(runTuning(deps));
    expect(result.steps.map((step) => [step.step.name, step.accepted])).toEqual([
      ["T1", false],
      ["T2", true],
    ]);
    expect(result).toMatchObject({ passed: "T2", accepted: true });
    expect(result).not.toHaveProperty("ownerDecision");
  });

  it("never switches level 2 off silently when no step passes: the owner decides", async () => {
    const { deps } = depsOf({ p99Ms: 70 });
    const result = await settle(runTuning(deps));
    expect(result.steps.map((step) => step.step.name)).toEqual(["T1", "T2", "T3"]);
    expect(result).toMatchObject({ passed: null, accepted: false });
    expect(result.ownerDecision).toContain("ask the owner");
  });

  it("is the table of the spec", () => {
    expect(TUNING_STEPS).toEqual([
      { name: "T1", pauseMinMs: 1000, pauseMaxMs: 2000, l2SoftMs: 1500 },
      { name: "T2", pauseMinMs: 2000, pauseMaxMs: 4000, l2SoftMs: 1000 },
      { name: "T3", pauseMinMs: 3000, pauseMaxMs: 6000, l2SoftMs: 700 },
    ]);
  });
});
