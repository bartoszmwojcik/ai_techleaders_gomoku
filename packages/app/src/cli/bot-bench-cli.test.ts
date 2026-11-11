import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BenchDeps } from "./bot-bench";

const { loadEnvConfig, runBench, runShowStep, runTuning } = vi.hoisted(() => ({
  loadEnvConfig: vi.fn(),
  runBench: vi.fn(),
  runShowStep: vi.fn(),
  runTuning: vi.fn(),
}));
vi.mock("@next/env", () => ({ default: { loadEnvConfig } }));
vi.mock("./bot-bench", async (original) => ({ ...(await original<object>()), runBench }));
vi.mock("./bot-bench-show", async (original) => ({ ...(await original<object>()), runShowStep, runTuning }));

const argv = process.argv;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetModules();
  runBench.mockReset();
  runShowStep.mockReset();
  runTuning.mockReset();
  loadEnvConfig.mockReset();
  log = vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  process.argv = argv;
  process.exitCode = undefined;
  log.mockRestore();
  vi.unstubAllGlobals();
});

async function load(...args: string[]): Promise<BenchDeps> {
  process.argv = [...argv.slice(0, 2), ...args];
  await import("./bot-bench-cli");
  return runBench.mock.calls[0]![0] as BenchDeps;
}

it("loads the root .env files quietly, runs the bench with the defaults and prints JSON", async () => {
  runBench.mockResolvedValue({ accepted: false });
  const deps = await load();

  const [root, dev, logger, forceReload] = loadEnvConfig.mock.calls[0]!;
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("gomoku");
  expect([dev, forceReload]).toEqual([true, true]);
  expect(logger.info()).toBeUndefined();
  expect(deps.positions).toBe(200);
  expect(deps.memory.source).not.toBe("fixed");
  expect(deps.limits[2]).toEqual({ softMs: 1500, ceilingMs: 3000 });
  expect(deps.probe).toBeUndefined();
  expect(typeof deps.createEngine(console).choose).toBe("function");
  const histogram = deps.createHistogram();
  expect(typeof histogram.percentile).toBe("function");
  expect(deps.rssMb()).toBeGreaterThan(0);
  expect(deps.now()).toBeGreaterThan(0);
  await expect(deps.sleep(1)).resolves.toBeUndefined();
  const printed = JSON.parse(log.mock.calls[0]![0] as string);
  expect(printed).toMatchObject({ node: process.version, cpus: expect.any(Number), accepted: false });
  expect(process.exitCode).toBe(1);
});

it("takes the positions, a fixed memory and a probe of another game from the options", async () => {
  runBench.mockResolvedValue({ accepted: true });
  const fetch = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const deps = await load("--positions", "6", "--memory-mb", "768", "--probe-url", "http://127.0.0.1:3000/api/games/x");
  expect(deps.positions).toBe(6);
  expect(deps.memory).toEqual({ availableMb: 768, source: "fixed" });
  await deps.probe!();
  expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3000/api/games/x");
  expect(process.exitCode).toBe(0);
});

describe("--show (show-mode P17)", () => {
  it("measures one step with the pause and the soft target of the configuration for 300 s", async () => {
    vi.stubEnv("BOT_SHOW_PAUSE_MIN_MS", "1500");
    vi.stubEnv("BOT_SHOW_PAUSE_MAX_MS", "");
    vi.stubEnv("SHOW_BOT_L2_SOFT_MS", "");
    runShowStep.mockResolvedValue({ accepted: true });
    process.argv = [...argv.slice(0, 2), "--show"];
    await import("./bot-bench-cli");

    const [step, deps] = runShowStep.mock.calls[0]!;
    expect(step).toEqual({ name: "custom", pauseMinMs: 1500, pauseMaxMs: 2000, l2SoftMs: 1500 });
    expect(deps.durationMs).toBe(300_000);
    expect(typeof deps.createEngine(console).choose).toBe("function");
    expect(runBench).not.toHaveBeenCalled();
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ mode: "show", accepted: true });
    expect(process.exitCode).toBe(0);
  });

  it("takes the step and the duration from the options, checked by the rules of the configuration", async () => {
    runShowStep.mockResolvedValue({ accepted: false });
    process.argv = [...argv.slice(0, 2), "--show", "--pause-min", "3000", "--pause-max", "6000", "--l2-soft", "700", "--duration", "60"];
    await import("./bot-bench-cli");

    const [step, deps] = runShowStep.mock.calls[0]!;
    expect(step).toEqual({ name: "custom", pauseMinMs: 3000, pauseMaxMs: 6000, l2SoftMs: 700 });
    expect(deps.durationMs).toBe(60_000);
    expect(process.exitCode).toBe(1);
  });

  it("refuses a pause beyond 8000 ms", async () => {
    process.argv = [...argv.slice(0, 2), "--show", "--pause-max", "9000"];
    await expect(import("./bot-bench-cli")).rejects.toThrow("BOT_SHOW_PAUSE_MAX_MS must be an integer from 0 to 8000.");
  });

  it("walks the tuning table with --tuning, its exit code the verdict", async () => {
    runTuning.mockResolvedValue({ steps: [], passed: null, accepted: false, ownerDecision: "ask" });
    process.argv = [...argv.slice(0, 2), "--show", "--tuning"];
    await import("./bot-bench-cli");

    expect(runTuning.mock.calls[0]![0].durationMs).toBe(300_000);
    expect(runShowStep).not.toHaveBeenCalled();
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ mode: "show-tuning", passed: null, ownerDecision: "ask" });
    expect(process.exitCode).toBe(1);
  });
});
