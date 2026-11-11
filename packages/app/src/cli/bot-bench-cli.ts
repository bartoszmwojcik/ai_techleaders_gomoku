// Entry point of `npm run bot:bench` (see ./bot-bench.ts). Options: `--positions N` (default 200),
// `--memory-mb N` (instead of the probe and `BOT_FIXED_MEMORY_MB`), `--probe-url URL` (a `GET` of
// another game's state measured while the bot computes, e.g. `http://127.0.0.1:3000/api/games/<id>`).
// `--show` (see ./bot-bench-show.ts): bot vs bot of level 2 as a show plays it, one tuning step — `--pause-min MS`,
// `--pause-max MS`, `--l2-soft MS` (default: `BOT_SHOW_PAUSE_*` and `SHOW_BOT_L2_SOFT_MS`), `--duration S` (default
// 300) — or `--tuning` (T1 → T2 → T3 until the first step passes); the probe reads twice a second.
// Run it where the app runs (`docker exec`), never next to a build (lesson 2026-10-30).
import { setTimeout as sleep } from "node:timers/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { resolve } from "node:path";

import nextEnv from "@next/env";

import { readBotConfig, readShowConfig } from "../server/config";
import { createWorkerBotEngine } from "../server/services/games/bot-engine";
import { ComputeGate } from "../server/services/games/compute-gate";
import { createResourceProbe } from "../server/services/games/resource-probe";
import { DEFAULT_BENCH_POSITIONS, runBench } from "./bot-bench";
import { SHOW_BENCH_MIN_DURATION_MS, runShowStep, runTuning } from "./bot-bench-show";

nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../../../.."), true, { info: () => undefined, error: console.error }, true);

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const config = readBotConfig(process.env);
const memoryMb = option("memory-mb");
const probeUrl = option("probe-url");
const common = {
  memory: memoryMb === undefined ? createResourceProbe({ fixedMb: config.fixedMemoryMb }).read() : { availableMb: Number(memoryMb), source: "fixed" as const },
  limits: config.limits,
  createEngine: (logger: Pick<Console, "info" | "warn" | "error">) => createWorkerBotEngine({ limits: config.limits, gate: new ComputeGate(), logger }),
  createHistogram: () => monitorEventLoopDelay({ resolution: 10 }),
  rssMb: () => process.memoryUsage.rss() / 1024 / 1024,
  now: () => performance.now(),
  sleep: (ms: number) => sleep(ms),
  ...(probeUrl !== undefined && {
    probe: async () => {
      await (await fetch(probeUrl)).arrayBuffer();
    },
  }),
};

async function show() {
  const durationS = option("duration");
  const deps = { ...common, durationMs: durationS === undefined ? SHOW_BENCH_MIN_DURATION_MS : Number(durationS) * 1000 };
  if (process.argv.includes("--tuning")) return { mode: "show-tuning", ...(await runTuning(deps)) };
  // The options override the variables and are checked by the same rules (min <= max <= 8000 ms).
  const { pauseMinMs, pauseMaxMs, botL2SoftMs } = readShowConfig({
    ...process.env,
    ...(option("pause-min") !== undefined && { BOT_SHOW_PAUSE_MIN_MS: option("pause-min") }),
    ...(option("pause-max") !== undefined && { BOT_SHOW_PAUSE_MAX_MS: option("pause-max") }),
    ...(option("l2-soft") !== undefined && { SHOW_BOT_L2_SOFT_MS: option("l2-soft") }),
  });
  const step = { name: "custom", pauseMinMs, pauseMaxMs, l2SoftMs: botL2SoftMs };
  return { mode: "show", ...(await runShowStep(step, deps)) };
}

const result = process.argv.includes("--show") ? await show() : await runBench({ ...common, positions: Number(option("positions") ?? DEFAULT_BENCH_POSITIONS) });
console.log(JSON.stringify({ node: process.version, cpus: (await import("node:os")).availableParallelism(), ...result }, null, 2));
process.exitCode = result.accepted ? 0 : 1;
