import { DEFAULT_BOT_TIME_LIMITS, countStones } from "@gomoku/core";
import { describe, expect, it, vi } from "vitest";

import type { BotEngine, BotTurn } from "../server/services/games/bot-engine";
import { BENCH_PHASES, benchPositions, percentile, runBench, type BenchDeps } from "./bot-bench";

describe("benchPositions", () => {
  it("cuts bot–bot games after 10, 30 and 60 moves in turn, skipping games over before that", () => {
    const positions = benchPositions(7);
    expect(positions.map(({ phase }) => phase)).toEqual([10, 30, 60, 10, 30, 60, 10]);
    for (const { phase, position } of positions) {
      expect(position.moveCount).toBe(phase);
      expect(countStones(position.black)).toBe(phase / 2);
      expect(countStones(position.white)).toBe(phase / 2);
    }
    const seeds = positions.map(({ seed }) => seed);
    expect(seeds.at(-1)! - seeds[0]!).toBeGreaterThan(positions.length - 1);
    expect(BENCH_PHASES).toEqual([10, 30, 60]);
  });
});

describe("percentile", () => {
  it("takes the nearest rank", () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([7], 0)).toBe(7);
  });
});

function setup({ ms = 1000, depth = 6, fail = false, probeMs = 0 }: { ms?: number; depth?: number; fail?: boolean; probeMs?: number } = {}) {
  let clock = 0;
  let rss = 100;
  const turns: BotTurn[] = [];
  const histogram = { enable: vi.fn(), disable: vi.fn(), percentile: vi.fn((p: number) => p * 1e5), max: 20e6 };
  const deps: BenchDeps = {
    positions: 4,
    memory: { availableMb: 768, source: "fixed" },
    limits: DEFAULT_BOT_TIME_LIMITS,
    createEngine: (logger): BotEngine => ({
      choose: async (turn) => {
        turns.push(turn);
        // A move that logs takes its time from the log; the clock moves only for one that does not.
        if (fail) clock += ms;
        rss += 10;
        if (fail) logger.error("{}");
        else logger.info(JSON.stringify({ event: "bot_move", ms, depth, nodes: ms * 50, stoppedBy: "soft" }));
        if (turns.length === 1) logger.warn("{}");
        return 0;
      },
    }),
    createHistogram: () => histogram as never,
    rssMb: () => rss,
    now: () => clock,
    sleep: async () => undefined,
  };
  const probe = vi.fn(async () => {
    clock += turns.length > 0 ? probeMs : 5;
  });
  return { deps, turns, histogram, probe };
}

describe("runBench (spec section 5, R18)", () => {
  it("measures level-2 moves of the frozen tier and accepts them within R18", async () => {
    const { deps, turns, histogram } = setup();
    const result = await runBench(deps);
    expect(turns).toHaveLength(4);
    expect(turns[0]).toMatchObject({ level: 2, depthCap: 8, memoryMb: 768, remainingClockMs: 600_000, moveNumber: 11, gameId: expect.stringMatching(/^bench-/) });
    expect(histogram.enable).toHaveBeenCalledOnce();
    expect(histogram.disable).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      strength: { memoryMb: 768, depthCap: 8 },
      limits: { softMs: 1500, ceilingMs: 3000 },
      moves: 4,
      moveMs: { p50: 1000, p95: 1000, max: 1000 },
      depth: { min: 6, p50: 6, max: 6 },
      kNodesPerSecond: 50,
      stoppedBy: { soft: 4 },
      problems: 1,
      rssGrowthMb: 40,
      eventLoopDelayMs: { p50: 5, p99: 9.9, max: 20 },
      otherGameRead: null,
      r18: { otherGameReadWithin2x: null },
      accepted: true,
    });
    expect(result.byPhase[10]!.moves).toBe(2);
    expect(result.byPhase[60]!.moves).toBe(1);
  });

  it("times moves that logged nothing (ceiling, failure) and rejects slow ones", async () => {
    const { deps } = setup({ ms: 3500, fail: true });
    const result = await runBench({ ...deps, positions: 2 });
    expect(result).toMatchObject({
      moveMs: { max: 3500 },
      stoppedBy: { fallback: 2 },
      r18: { p95WithinSoftTarget: false, maxWithinCeiling: false },
      accepted: false,
    });
    expect(result.byPhase[60]).toMatchObject({ moves: 0, depth: { min: 0, max: 0 }, moveMs: { max: 0 } });
  });

  it("compares the reads of another game during the moves with a baseline", async () => {
    const fast = setup({ probeMs: 8 });
    const accepted = await runBench({ ...fast.deps, probe: fast.probe });
    expect(accepted.otherGameRead).toEqual({ baselineMs: { p50: 5, p95: 5 }, duringMs: expect.any(Object) });
    expect(accepted.r18.otherGameReadWithin2x).toBe(true);
    const slow = setup({ probeMs: 50 });
    const rejected = await runBench({ ...slow.deps, probe: slow.probe });
    expect(rejected.r18.otherGameReadWithin2x).toBe(false);
  });

  it("refuses a memory below every tier", async () => {
    const { deps } = setup();
    await expect(runBench({ ...deps, memory: { availableMb: 100, source: "os" } })).rejects.toThrow("Too little memory");
  });
});
