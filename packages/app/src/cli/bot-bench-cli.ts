// Entry point of `npm run bot:bench` (see ./bot-bench.ts). Options: `--positions N` (default 200),
// `--memory-mb N` (instead of the probe and `BOT_FIXED_MEMORY_MB`), `--probe-url URL` (a `GET` of
// another game's state measured while the bot computes, e.g. `http://127.0.0.1:3000/api/games/<id>`).
// Run it where the app runs (`docker exec`), never next to a build (lesson 2026-10-30).
import { setTimeout as sleep } from "node:timers/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { resolve } from "node:path";

import nextEnv from "@next/env";

import { readBotConfig } from "../server/config";
import { createWorkerBotEngine } from "../server/services/games/bot-engine";
import { ComputeGate } from "../server/services/games/compute-gate";
import { createResourceProbe } from "../server/services/games/resource-probe";
import { DEFAULT_BENCH_POSITIONS, runBench } from "./bot-bench";

nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../../../.."), true, { info: () => undefined, error: console.error }, true);

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const config = readBotConfig(process.env);
const memoryMb = option("memory-mb");
const probeUrl = option("probe-url");
const result = await runBench({
  positions: Number(option("positions") ?? DEFAULT_BENCH_POSITIONS),
  memory: memoryMb === undefined ? createResourceProbe({ fixedMb: config.fixedMemoryMb }).read() : { availableMb: Number(memoryMb), source: "fixed" },
  limits: config.limits,
  createEngine: (logger) => createWorkerBotEngine({ limits: config.limits, gate: new ComputeGate(), logger }),
  createHistogram: () => monitorEventLoopDelay({ resolution: 10 }),
  rssMb: () => process.memoryUsage.rss() / 1024 / 1024,
  now: () => performance.now(),
  sleep: (ms) => sleep(ms),
  ...(probeUrl !== undefined && {
    probe: async () => {
      await (await fetch(probeUrl)).arrayBuffer();
    },
  }),
});
console.log(JSON.stringify({ node: process.version, cpus: (await import("node:os")).availableParallelism(), ...result }, null, 2));
process.exitCode = result.accepted ? 0 : 1;
