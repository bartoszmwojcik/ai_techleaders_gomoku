// `npm run bot:bench` (spec 2026-11-05-hosted-bot, section 5 and R18; E13-S04-T02): the cost of a
// level-2 move measured through the production path — the worker thread, the gate, the budget of the
// memory tier — on positions from bot–bot games in three phases (moves 10, 30, 60). Prints JSON.
import {
  ARENA_BUDGET,
  botStrengthFor,
  createBitboard,
  playArenaGame,
  withStone,
  type BotPosition,
  type BotTimeLimits,
  type BotLevel,
} from "@gomoku/core";

import type { BotEngine } from "../server/services/games/bot-engine";
import type { MemoryReading } from "../server/services/games/resource-probe";

/** The phases of the spec: positions after 10, 30 and 60 moves. */
export const BENCH_PHASES = [10, 30, 60] as const;
export const DEFAULT_BENCH_POSITIONS = 200;

/** The part of `monitorEventLoopDelay()` the bench reads (nanoseconds). */
export type LoopHistogram = { enable(): unknown; disable(): unknown; percentile(p: number): number; max: number };

export type BenchPosition = { seed: number; phase: number; position: BotPosition };

/**
 * `count` positions, the phases in turn: game `seed` of level 1 against level 1 (fixed seeds, the
 * arena's node budget) cut after `phase` moves; a game over before that is skipped.
 */
export function benchPositions(count: number): BenchPosition[] {
  const positions: BenchPosition[] = [];
  for (let seed = 1; positions.length < count; seed++) {
    const phase = BENCH_PHASES[positions.length % BENCH_PHASES.length]!;
    const { moves } = playArenaGame(seed, 1, 1, ARENA_BUDGET);
    if (moves.length <= phase) continue;
    let black = createBitboard();
    let white = createBitboard();
    moves.slice(0, phase).forEach((cell, index) => {
      if (index % 2 === 0) black = withStone(black, cell);
      else white = withStone(white, cell);
    });
    positions.push({ seed, phase, position: { black, white, moveCount: phase } });
  }
  return positions;
}

/** The `p`-th percentile (nearest rank) of `values`; 0 for none. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

const round = (value: number) => Math.round(value * 10) / 10;

type Move = { phase: number; ms: number; depth: number; nodes: number; stoppedBy: string };

export type BenchDeps = {
  positions: number;
  /** The memory the strength is frozen from (the probe or `--memory-mb`). */
  memory: MemoryReading;
  limits: Readonly<Record<BotLevel, BotTimeLimits>>;
  /** The engine of the app, logging through `logger` (its `bot_move` lines are the measurement). */
  createEngine: (logger: Pick<Console, "info" | "warn" | "error">) => BotEngine;
  /** The main thread's event-loop delay (`monitorEventLoopDelay`). */
  createHistogram: () => LoopHistogram;
  rssMb: () => number;
  now: () => number;
  /** A read of another game (`GET`) while the bot computes; measured only when given. */
  probe?: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
};

export type BenchResult = Awaited<ReturnType<typeof runBench>>;

/** Samples `probe` every 100 ms until `stop()`: the latencies in ms. */
function sampleProbe(probe: () => Promise<void>, deps: Pick<BenchDeps, "now" | "sleep">) {
  const latencies: number[] = [];
  let running = true;
  const done = (async () => {
    while (running) {
      const start = deps.now();
      await probe();
      latencies.push(deps.now() - start);
      await deps.sleep(100);
    }
  })();
  return {
    latencies,
    stop: async () => {
      running = false;
      await done;
    },
  };
}

/** Runs the bench and returns the JSON of section 5, with the R18 verdict (a local result is an approximation). */
export async function runBench(deps: BenchDeps) {
  const strength = botStrengthFor(2, deps.memory.availableMb);
  if (!strength) throw new Error(`Too little memory for the bot: ${deps.memory.availableMb} MB`);
  const moves: Move[] = [];
  const problems: string[] = [];
  let phase = 0;
  const engine = deps.createEngine({
    info: (line: string) => {
      const { ms, depth, nodes, stoppedBy } = JSON.parse(line) as Move;
      moves.push({ phase, ms, depth, nodes, stoppedBy });
    },
    warn: (line: string) => problems.push(line),
    error: (line: string) => problems.push(line),
  });

  const baseline = deps.probe ? sampleProbe(deps.probe, deps) : null;
  if (baseline) await deps.sleep(2000);
  await baseline?.stop();

  const histogram = deps.createHistogram();
  const during = deps.probe ? sampleProbe(deps.probe, deps) : null;
  const rssBefore = deps.rssMb();
  let rssPeak = rssBefore;
  histogram.enable();
  const positions = benchPositions(deps.positions);
  for (const [index, item] of positions.entries()) {
    phase = item.phase;
    const started = deps.now();
    await engine.choose({
      gameId: `bench-${item.seed}`,
      moveNumber: item.phase + 1,
      position: item.position,
      level: 2,
      depthCap: strength.depthCap,
      memoryMb: strength.memoryMb,
      remainingClockMs: 600_000,
    });
    // A move that hit the ceiling or failed logs no `bot_move`: its time is taken here.
    if (moves.length === index) moves.push({ phase, ms: deps.now() - started, depth: 0, nodes: 0, stoppedBy: "fallback" });
    rssPeak = Math.max(rssPeak, deps.rssMb());
  }
  histogram.disable();
  await during?.stop();

  const ms = moves.map((move) => move.ms);
  const summary = (list: Move[]) => ({
    moves: list.length,
    moveMs: { p50: percentile(list.map((m) => m.ms), 50), p95: percentile(list.map((m) => m.ms), 95), max: Math.max(0, ...list.map((m) => m.ms)) },
    depth: { min: list.length === 0 ? 0 : Math.min(...list.map((m) => m.depth)), p50: percentile(list.map((m) => m.depth), 50), max: Math.max(0, ...list.map((m) => m.depth)) },
    kNodesPerSecond: round(
      list.reduce((sum, m) => sum + m.nodes, 0) / Math.max(1, list.reduce((sum, m) => sum + m.ms, 0)),
    ),
  });
  const loop = {
    p50: round(histogram.percentile(50) / 1e6),
    p99: round(histogram.percentile(99) / 1e6),
    max: round(histogram.max / 1e6),
  };
  const probe = baseline && during
    ? {
        baselineMs: { p50: round(percentile(baseline.latencies, 50)), p95: round(percentile(baseline.latencies, 95)) },
        duringMs: { p50: round(percentile(during.latencies, 50)), p95: round(percentile(during.latencies, 95)) },
      }
    : null;
  const { softMs, ceilingMs } = deps.limits[2];
  const rssGrowthMb = round(rssPeak - rssBefore);
  const r18 = {
    p95WithinSoftTarget: percentile(ms, 95) <= 1.2 * softMs,
    maxWithinCeiling: Math.max(0, ...ms) <= ceilingMs + 250,
    eventLoopP99Within50Ms: loop.p99 <= 50,
    rssGrowthWithin100Mb: rssGrowthMb <= 100,
    otherGameReadWithin2x: probe ? probe.duringMs.p95 <= 2 * Math.max(1, probe.baselineMs.p95) : null,
  };
  return {
    memory: deps.memory,
    strength: { memoryMb: strength.memoryMb, depthCap: strength.depthCap },
    limits: deps.limits[2],
    ...summary(moves),
    byPhase: Object.fromEntries(BENCH_PHASES.map((p) => [p, summary(moves.filter((m) => m.phase === p))])),
    stoppedBy: moves.reduce<Record<string, number>>((counts, m) => ({ ...counts, [m.stoppedBy]: (counts[m.stoppedBy] ?? 0) + 1 }), {}),
    problems: problems.length,
    rssGrowthMb,
    eventLoopDelayMs: loop,
    otherGameRead: probe,
    r18,
    accepted: Object.values(r18).every((passed) => passed !== false),
  };
}
