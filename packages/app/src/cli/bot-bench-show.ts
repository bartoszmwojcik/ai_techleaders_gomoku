// `npm run bot:bench -- --show` (spec 2026-11-09-show-mode, P17, "Resource policy & tuning of level 2"; E14-S04-T01):
// two bots of level 2 play each other, game after game, with the pause and the soft target of one tuning step, for
// at least 300 s, through the production path — the worker thread, the gate, the budget of the memory tier — while a
// probe reads another game's state twice a second. The verdict of the step follows P17; `--tuning` walks T1 → T3 and
// stops at the first step that passes. Prints JSON; the exit code is the verdict.
import {
  BOARD_CELLS,
  botStrengthFor,
  checkWin,
  clipShowPause,
  createBitboard,
  hasStone,
  showBotLimits,
  showPauseMs,
  withStone,
  type BotLevel,
  type BotTimeLimits,
} from "@gomoku/core";

import type { BotEngine } from "../server/services/games/bot-engine";
import type { MemoryReading } from "../server/services/games/resource-probe";
import { percentile, type LoopHistogram } from "./bot-bench";

/** One step of the tuning table: the pause between the bots' moves and the soft target of level 2 in a show. */
export type ShowStep = { name: string; pauseMinMs: number; pauseMaxMs: number; l2SoftMs: number };

/** The tuning table of the spec, applied in order until a step passes (P17; the values are proposals, A-24). */
export const TUNING_STEPS: readonly ShowStep[] = [
  { name: "T1", pauseMinMs: 1000, pauseMaxMs: 2000, l2SoftMs: 1500 },
  { name: "T2", pauseMinMs: 2000, pauseMaxMs: 4000, l2SoftMs: 1000 },
  { name: "T3", pauseMinMs: 3000, pauseMaxMs: 6000, l2SoftMs: 700 },
];

/** P17: a step is measured for at least five minutes; a shorter run is reported, but never passes. */
export const SHOW_BENCH_MIN_DURATION_MS = 300_000;
/** The probe reads another game twice a second (P17). */
export const SHOW_PROBE_INTERVAL_MS = 500;
/** How long the probe reads with no computation, before the bots start (its baseline). */
export const SHOW_BASELINE_MS = 5000;
/** RSS is sampled every minute (P17), plus at the start and at the end. */
export const SHOW_RSS_INTERVAL_MS = 60_000;
/** "No steady growth in the last 2 minutes": the samples of that window must not each grow by more than this. */
export const SHOW_RSS_STEADY_STEP_MB = 1;
/** Each side's clock in a game (10 minutes, `INITIAL_CLOCK_MS`). */
const CLOCK_MS = 600_000;

export type ShowBenchDeps = {
  durationMs: number;
  /** The memory the strength is frozen from (the probe or `--memory-mb`). */
  memory: MemoryReading;
  /** `BOT_L*_SOFT_MS`/`_CEILING_MS`; the step's soft target replaces level 2's as in a show (`showBotLimits`). */
  limits: Readonly<Record<BotLevel, BotTimeLimits>>;
  /** The engine of the app, logging through `logger` (its `bot_move` lines are the measurement). */
  createEngine: (logger: Pick<Console, "info" | "warn" | "error">) => BotEngine;
  /** The main thread's event-loop delay (`monitorEventLoopDelay`, resolution 10 ms). */
  createHistogram: () => LoopHistogram;
  rssMb: () => number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** A read of another game (`GET`); without it the probe criterion is not measured (`null`). */
  probe?: () => Promise<void>;
};

type Move = { ms: number; level: number; depth: number; stoppedBy: string };
type Sample = { latencyMs: number; computing: boolean };

const round = (value: number) => Math.round(value * 10) / 10;

/** Reads `probe` every `SHOW_PROBE_INTERVAL_MS` (start to start) until `stop()`; each read notes whether a bot computed. */
function sampleProbe(probe: () => Promise<void>, computing: () => boolean, deps: Pick<ShowBenchDeps, "now" | "sleep">) {
  const samples: Sample[] = [];
  let running = true;
  const done = (async () => {
    while (running) {
      const start = deps.now();
      const during = computing();
      await probe();
      const latencyMs = deps.now() - start;
      samples.push({ latencyMs, computing: during || computing() });
      await deps.sleep(Math.max(0, SHOW_PROBE_INTERVAL_MS - latencyMs));
    }
  })();
  return {
    samples,
    stop: async () => {
      running = false;
      await done;
    },
  };
}

/** The samples of the last two minutes each grew by more than `SHOW_RSS_STEADY_STEP_MB` (three samples at least). */
export function steadyGrowth(samples: readonly { atMs: number; mb: number }[]): boolean {
  const last = samples.at(-1);
  if (!last) return false;
  const window = samples.filter((sample) => sample.atMs >= last.atMs - 2 * SHOW_RSS_INTERVAL_MS);
  if (window.length < 3) return false;
  return window.every((sample, index) => index === 0 || sample.mb - window[index - 1]!.mb > SHOW_RSS_STEADY_STEP_MB);
}

export type ShowStepResult = Awaited<ReturnType<typeof runShowStep>>;

/**
 * Measures one tuning step: bot vs bot of level 2, as a show plays it — the pause `showPauseMs` clipped to a quarter of
 * the bot's clock, then the search with the show's limits; the pause and the search are charged to the bot's clock, and
 * a game ends on five in a row, a full board or a clock run out. Then the next game, until `durationMs` is over.
 */
export async function runShowStep(step: ShowStep, deps: ShowBenchDeps) {
  const strength = botStrengthFor(2, deps.memory.availableMb);
  if (!strength) throw new Error(`Too little memory for the bot: ${deps.memory.availableMb} MB`);
  const limits = showBotLimits(deps.limits, step.l2SoftMs);
  const moves: Move[] = [];
  let failures = 0;
  let ceilings = 0;
  const engine = deps.createEngine({
    info: (line: string) => {
      const { ms, level, depth, stoppedBy } = JSON.parse(line) as Move;
      moves.push({ ms, level, depth, stoppedBy });
    },
    warn: () => {
      ceilings++;
    },
    error: () => {
      failures++;
    },
  });

  let computing = false;
  const baseline = deps.probe ? sampleProbe(deps.probe, () => computing, deps) : null;
  if (baseline) await deps.sleep(SHOW_BASELINE_MS);
  await baseline?.stop();

  const histogram = deps.createHistogram();
  const started = deps.now();
  const rss = [{ atMs: 0, mb: deps.rssMb() }];
  const sampleRss = (force = false) => {
    const atMs = deps.now() - started;
    if (force || atMs - rss.at(-1)!.atMs >= SHOW_RSS_INTERVAL_MS) rss.push({ atMs, mb: deps.rssMb() });
  };
  const during = deps.probe ? sampleProbe(deps.probe, () => computing, deps) : null;
  const over = () => deps.now() - started >= deps.durationMs;
  const ends = { five: 0, full: 0, timeout: 0, unfinished: 0 };
  let games = 0;
  histogram.enable();
  while (!over()) {
    const gameId = `show-bench-${++games}`;
    const boards = [createBitboard(), createBitboard()];
    const clocks = [CLOCK_MS, CLOCK_MS];
    let moveCount = 0;
    let end: keyof typeof ends = "unfinished";
    while (!over()) {
      const side = moveCount % 2;
      const pauseMs = clipShowPause(showPauseMs(gameId, moveCount + 1, { minMs: step.pauseMinMs, maxMs: step.pauseMaxMs }), clocks[side]!);
      await deps.sleep(pauseMs);
      const logged = moves.length;
      computing = true;
      const startedAt = deps.now();
      const cell = await engine.choose({
        gameId,
        moveNumber: moveCount + 1,
        position: { black: boards[0]!, white: boards[1]!, moveCount },
        level: 2,
        depthCap: strength.depthCap,
        memoryMb: strength.memoryMb,
        remainingClockMs: clocks[side]! - pauseMs,
        limits,
      });
      const ms = deps.now() - startedAt;
      computing = false;
      // A move that hit the ceiling or failed logs no `bot_move`: its time is taken here.
      if (moves.length === logged) moves.push({ ms, level: 2, depth: 0, stoppedBy: "fallback" });
      sampleRss();
      clocks[side] = clocks[side]! - pauseMs - ms;
      boards[side] = withStone(boards[side]!, cell);
      moveCount++;
      const own = boards[side]!;
      if (clocks[side]! <= 0) end = "timeout";
      else if (checkWin((at) => hasStone(own, at), cell)) end = "five";
      else if (moveCount >= BOARD_CELLS) end = "full";
      if (end !== "unfinished") break;
    }
    ends[end]++;
  }
  histogram.disable();
  await during?.stop();
  sampleRss(true);

  const level2 = moves.filter((move) => move.level === 2).map((move) => move.ms);
  const loop = {
    p50: round(histogram.percentile(50) / 1e6),
    p99: round(histogram.percentile(99) / 1e6),
    max: round(histogram.max / 1e6),
  };
  const busy = during?.samples.filter((sample) => sample.computing).map((sample) => sample.latencyMs) ?? [];
  const probe =
    baseline && during
      ? {
          reads: during.samples.length,
          baselineMs: { p50: round(percentile(baseline.samples.map((s) => s.latencyMs), 50)), p95: round(percentile(baseline.samples.map((s) => s.latencyMs), 95)) },
          duringMs: { reads: busy.length, p50: round(percentile(busy, 50)), p95: round(percentile(busy, 95)) },
        }
      : null;
  const rssPeak = Math.max(...rss.map((sample) => sample.mb));
  const rssGrowthMb = round(rssPeak - rss[0]!.mb);
  const rssSteadyGrowth = steadyGrowth(rss);
  const durationMs = Math.round(deps.now() - started);
  const p17 = {
    durationAtLeast300s: deps.durationMs >= SHOW_BENCH_MIN_DURATION_MS,
    eventLoopP99Within50Ms: loop.p99 <= 50,
    p95WithinSoftTarget: percentile(level2, 95) <= 1.2 * limits[2].softMs,
    maxWithinCeiling: Math.max(0, ...level2) <= limits[2].ceilingMs + 250,
    otherGameReadWithin2xAnd300Ms: probe ? probe.duringMs.p95 <= 2 * Math.max(1, probe.baselineMs.p95) && probe.duringMs.p95 <= 300 : null,
    rssGrowthWithin100MbAndNotSteady: rssGrowthMb <= 100 && !rssSteadyGrowth,
    noFailedOrInterruptedMoves: failures === 0 && ceilings === 0,
  };
  return {
    step,
    limits: limits[2],
    strength: { memoryMb: strength.memoryMb, depthCap: strength.depthCap },
    durationMs,
    games,
    ends,
    moves: moves.length,
    level1Moves: moves.length - level2.length,
    moveMs: { p50: round(percentile(level2, 50)), p95: round(percentile(level2, 95)), max: round(Math.max(0, ...level2)) },
    depth: { p50: percentile(moves.map((m) => m.depth), 50), max: Math.max(0, ...moves.map((m) => m.depth)) },
    stoppedBy: moves.reduce<Record<string, number>>((counts, m) => ({ ...counts, [m.stoppedBy]: (counts[m.stoppedBy] ?? 0) + 1 }), {}),
    failures,
    ceilings,
    eventLoopDelayMs: loop,
    otherGameRead: probe,
    rssMb: rss.map((sample) => ({ atS: Math.round(sample.atMs / 1000), mb: round(sample.mb) })),
    rssGrowthMb,
    rssSteadyGrowth,
    p17,
    accepted: Object.values(p17).every((passed) => passed !== false),
  };
}

/**
 * `--tuning`: the steps in order, stopping at the first that passes (P17). When none passes — not even T3 — level 2 is
 * NOT switched off silently: the result says the owner decides (a documented exception, or the show on level 1).
 */
export async function runTuning(deps: ShowBenchDeps, steps: readonly ShowStep[] = TUNING_STEPS) {
  const results: ShowStepResult[] = [];
  for (const step of steps) {
    const result = await runShowStep(step, deps);
    results.push(result);
    if (result.accepted) return { steps: results, passed: step.name, accepted: true as const };
  }
  return {
    steps: results,
    passed: null,
    accepted: false as const,
    ownerDecision:
      "No tuning step passed: stop and ask the owner — a documented exception (as for one bot, #264/A-22) or the show on level 1. Do not switch level 2 off silently.",
  };
}
