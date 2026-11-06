import { Worker } from "node:worker_threads";

import type { BotJob } from "./bot-worker";

/**
 * The heap of one search thread (spec R7): the table is an `ArrayBuffer` outside the heap, so the
 * limits bound the engine's own objects; a runaway search dies alone, the process survives.
 */
export const BOT_WORKER_RESOURCE_LIMITS = { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } as const;

/**
 * Starts the thread of one move. The `new Worker(new URL("./bot-worker.ts", import.meta.url))` form
 * must stay literal: Turbopack recognises it and emits the worker as its own chunk (spike
 * E13-S04-T01: works after `next build` + `next start` in the production image). `tsx` (the bench)
 * loads the same file directly.
 */
export function spawnBotWorker(job: BotJob): Worker {
  return new Worker(new URL("./bot-worker.ts", import.meta.url), {
    workerData: job,
    resourceLimits: BOT_WORKER_RESOURCE_LIMITS,
  });
}
