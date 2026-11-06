// The bot's worker thread (spec 2026-11-05-hosted-bot R5, "Wątek roboczy"): one per move, started by
// `spawnBotWorker`. It runs the pure engine of `@gomoku/core` and reports every completed iteration,
// so the main thread always holds a move to play when it stops or kills the search.
import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { chooseMove, rngFor, type BotLevel, type BotPosition, type MoveChoice, type SearchBudget } from "@gomoku/core";

/** Marks the data of a bot job: any other worker (a test runner's) never starts the loop. */
export const BOT_JOB_KIND = "gomoku-bot-job";

/** What the main thread sends with `workerData` (structured clone: the bitboards are copied). */
export type BotJob = {
  kind: typeof BOT_JOB_KIND;
  gameId: string;
  moveNumber: number;
  position: BotPosition;
  level: BotLevel;
  budget: SearchBudget;
  /** One `Int32`: non-zero asks the search to stop now (`Atomics.store` by the main thread). */
  stop: SharedArrayBuffer;
};

export type BotWorkerMessage = { type: "iteration"; choice: MoveChoice } | { type: "done"; choice: MoveChoice };

export type BotWorkerPort = { postMessage(message: BotWorkerMessage): void };

/** The work of the thread: the seed is derived here (R16), because a function cannot be cloned. */
export function runBotJob(port: BotWorkerPort, job: BotJob, now: () => number = () => performance.now()): void {
  const flag = new Int32Array(job.stop);
  const choice = chooseMove({
    position: job.position,
    level: job.level,
    budget: job.budget,
    rng: rngFor(job.gameId, job.moveNumber),
    now,
    shouldStop: () => Atomics.load(flag, 0) !== 0,
    onIteration: (partial) => port.postMessage({ type: "iteration", choice: partial }),
  });
  port.postMessage({ type: "done", choice });
}

export function isBotJob(data: unknown): data is BotJob {
  return typeof data === "object" && data !== null && (data as { kind?: unknown }).kind === BOT_JOB_KIND;
}

// The entry point of the thread; a thrown error ends the thread and reaches the main one as `error`.
if (!isMainThread && parentPort && isBotJob(workerData)) runBotJob(parentPort, workerData);
