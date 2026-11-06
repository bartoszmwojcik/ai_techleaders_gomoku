import { cellOf, chooseMove, createBitboard, rngFor, withStone } from "@gomoku/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BOT_JOB_KIND, isBotJob, runBotJob, type BotJob, type BotWorkerMessage } from "./bot-worker";

const black = withStone(withStone(createBitboard(), cellOf(7, 7)), cellOf(8, 8));
const white = withStone(createBitboard(), cellOf(7, 8));
const budget = { softMs: 1e9, ceilingMs: 1e9, maxDepth: 3, ttBytes: 1 << 16, maxNodes: 5000 };

const job = (extra: Partial<BotJob> = {}): BotJob => ({
  kind: BOT_JOB_KIND,
  gameId: "game-1",
  moveNumber: 4,
  position: { black, white, moveCount: 3 },
  level: 2,
  budget,
  stop: new SharedArrayBuffer(4),
  ...extra,
});

describe("runBotJob (the worker's loop)", () => {
  it("reports every iteration and the move, with the seed of the game and move (R16)", () => {
    const messages: BotWorkerMessage[] = [];
    runBotJob({ postMessage: (message) => messages.push(message) }, job(), () => 0);
    const done = messages.at(-1)!;
    expect(done.type).toBe("done");
    expect(messages.filter(({ type }) => type === "iteration").length).toBeGreaterThan(0);
    const expected = chooseMove({ position: job().position, level: 2, budget, rng: rngFor("game-1", 4), now: () => 0 });
    expect(done.choice.cell).toBe(expected.cell);
  });

  it("stops at once when the main thread raised the flag", () => {
    const stop = new SharedArrayBuffer(4);
    Atomics.store(new Int32Array(stop), 0, 1);
    const messages: BotWorkerMessage[] = [];
    runBotJob({ postMessage: (message) => messages.push(message) }, job({ stop }));
    expect(messages.at(-1)).toMatchObject({ type: "done", choice: { stoppedBy: "stop" } });
  });

  it("recognises only its own jobs", () => {
    expect(isBotJob(job())).toBe(true);
    expect(isBotJob({ kind: "other" })).toBe(false);
    expect(isBotJob(null)).toBe(false);
    expect(isBotJob("job")).toBe(false);
  });
});

describe("the entry point of the thread", () => {
  afterEach(() => {
    vi.doUnmock("node:worker_threads");
    vi.resetModules();
  });

  async function load(threads: { isMainThread: boolean; parentPort: unknown; workerData: unknown }) {
    vi.resetModules();
    vi.doMock("node:worker_threads", () => threads);
    await import("./bot-worker");
  }

  it("runs the job inside a bot thread", async () => {
    const postMessage = vi.fn();
    await load({ isMainThread: false, parentPort: { postMessage }, workerData: job() });
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "done" }));
  });

  it.each([
    ["on the main thread", { isMainThread: true, parentPort: null, workerData: null }],
    ["without a port", { isMainThread: false, parentPort: null, workerData: null }],
    ["in another worker", { isMainThread: false, parentPort: { postMessage: vi.fn() }, workerData: { pool: 1 } }],
  ])("does nothing %s", async (_name, threads) => {
    await load(threads);
    const port = threads.parentPort as { postMessage: ReturnType<typeof vi.fn> } | null;
    if (port) expect(port.postMessage).not.toHaveBeenCalled();
  });
});
