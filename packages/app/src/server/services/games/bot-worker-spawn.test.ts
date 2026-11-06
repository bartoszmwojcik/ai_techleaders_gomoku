import { describe, expect, it, vi } from "vitest";

const Worker = vi.hoisted(() => vi.fn(function (this: Record<string, unknown>, url: URL, options: unknown) {
  this.url = url;
  this.options = options;
}));
vi.mock("node:worker_threads", () => ({ Worker }));

import { BOT_WORKER_RESOURCE_LIMITS, spawnBotWorker } from "./bot-worker-spawn";
import type { BotJob } from "./bot-worker";

describe("spawnBotWorker (hosted-bot R5, R7)", () => {
  it("starts the bot's worker file with the job and the heap limits", () => {
    const job = { kind: "gomoku-bot-job" } as BotJob;
    const worker = spawnBotWorker(job) as unknown as { url: URL; options: unknown };
    expect(worker.url.href).toMatch(/\/bot-worker\.ts$/);
    expect(worker.options).toEqual({ workerData: job, resourceLimits: BOT_WORKER_RESOURCE_LIMITS });
    expect(BOT_WORKER_RESOURCE_LIMITS).toEqual({ maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 });
  });
});
