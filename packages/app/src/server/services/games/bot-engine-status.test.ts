import { DEFAULT_BOT_TIME_LIMITS } from "@gomoku/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BotEngine, BotTurn } from "./bot-engine";
import { botFailures } from "./bot-engine";
import { createBotEngineStatus } from "./bot-engine-status";
import { ComputeGate, computeGate } from "./compute-gate";

const { createWorkerBotEngine } = vi.hoisted(() => ({ createWorkerBotEngine: vi.fn() }));
vi.mock("./bot-engine", async (original) => ({ ...(await original<object>()), createWorkerBotEngine }));

type Logger = Pick<Console, "info" | "warn" | "error">;
const moveLine = (ms: number) => JSON.stringify({ event: "bot_move", ms });

/** An engine that "computes" for `ms` on the fake clock and then logs what `log` says. */
function fakeEngine(clock: { t: number }, ms: number, log: (logger: Logger) => void) {
  const turns: BotTurn[] = [];
  const createEngine = vi.fn((logger: Logger): BotEngine => ({
    choose: async (turn) => {
      turns.push(turn);
      clock.t += ms;
      log(logger);
      return 112;
    },
  }));
  return { createEngine, turns };
}

afterEach(() => {
  createWorkerBotEngine.mockReset();
  botFailures().clear();
});

describe("createBotEngineStatus (show-mode P18)", () => {
  it("passes a level-1 move on an empty board with a fresh game id, within the level-1 ceiling", async () => {
    const clock = { t: 0 };
    const { createEngine, turns } = fakeEngine(clock, 40, (logger) => logger.info(moveLine(30)));
    const status = createBotEngineStatus({ limits: DEFAULT_BOT_TIME_LIMITS, createEngine, now: () => clock.t });

    await expect(status.trial()).resolves.toEqual({ ok: true, ms: 30, limitMs: 250, waitedMs: 10 });
    expect(turns[0]).toMatchObject({ moveNumber: 1, level: 1, depthCap: null, memoryMb: null, position: { moveCount: 0 } });
    expect(turns[0]!.gameId).toMatch(/^preflight-[0-9a-f-]{36}$/);
    await status.trial();
    expect(turns[1]!.gameId).not.toBe(turns[0]!.gameId);
  });

  it("fails a move slower than the ceiling", async () => {
    const clock = { t: 0 };
    const { createEngine } = fakeEngine(clock, 300, (logger) => logger.info(moveLine(251)));
    const status = createBotEngineStatus({ limits: DEFAULT_BOT_TIME_LIMITS, createEngine, now: () => clock.t });
    await expect(status.trial()).resolves.toMatchObject({ ok: false, ms: 251 });
  });

  it("fails a trial the thread gave no move for (the inline fallback), reports the whole call and logs the error", async () => {
    const clock = { t: 0 };
    const logger = { warn: vi.fn(), error: vi.fn() };
    const { createEngine } = fakeEngine(clock, 12, (engineLogger) => {
      botFailures().set("x", 1);
      engineLogger.error("bot_engine_error");
    });
    const status = createBotEngineStatus({ limits: DEFAULT_BOT_TIME_LIMITS, createEngine, now: () => clock.t, logger });
    await expect(status.trial()).resolves.toEqual({ ok: false, ms: 12, limitMs: 250, waitedMs: 0 });
    expect(logger.error).toHaveBeenCalledWith("bot_engine_error");
  });

  it("fails a move that hit the ceiling (a warning) even with a move logged", async () => {
    const clock = { t: 0 };
    const logger = { warn: vi.fn(), error: vi.fn() };
    const { createEngine } = fakeEngine(clock, 5, (engineLogger) => {
      engineLogger.warn("bot_ceiling");
      engineLogger.info(moveLine(5));
    });
    const status = createBotEngineStatus({ limits: DEFAULT_BOT_TIME_LIMITS, createEngine, now: () => clock.t, logger });
    await expect(status.trial()).resolves.toMatchObject({ ok: false });
    expect(logger.warn).toHaveBeenCalledWith("bot_ceiling");
  });

  it("forgets the failures of the trial's game, even when the engine throws", async () => {
    let gameId = "";
    const createEngine = () => ({
      choose: async (turn: BotTurn) => {
        gameId = turn.gameId;
        botFailures().set(turn.gameId, 3);
        throw new Error("boom");
      },
    });
    const status = createBotEngineStatus({ limits: DEFAULT_BOT_TIME_LIMITS, createEngine });
    await expect(status.trial()).rejects.toThrow("boom");
    expect(botFailures().has(gameId)).toBe(false);
  });

  it("tells how many computations wait for the gate", async () => {
    const gate = new ComputeGate();
    const status = createBotEngineStatus({ limits: DEFAULT_BOT_TIME_LIMITS, gate });
    expect(status.pending()).toBe(0);
    const noop = () => undefined;
    let release: () => void = noop;
    const running = gate.run(() => new Promise<void>((resolve) => (release = resolve)));
    void gate.run(async () => undefined);
    expect(status.pending()).toBe(2);
    await vi.waitFor(() => expect(release).not.toBe(noop));
    release();
    await running;
  });

  it("uses the app's worker engine behind the process-wide gate by default", async () => {
    createWorkerBotEngine.mockImplementation(({ logger }: { logger: Logger }) => ({
      choose: async () => {
        logger.info(moveLine(1));
        return 0;
      },
    }));
    const status = createBotEngineStatus({ limits: DEFAULT_BOT_TIME_LIMITS });
    await expect(status.trial()).resolves.toMatchObject({ ok: true, ms: 1 });
    expect(createWorkerBotEngine).toHaveBeenCalledWith(expect.objectContaining({ limits: DEFAULT_BOT_TIME_LIMITS, gate: computeGate() }));
    expect(status.pending()).toBe(computeGate().pending);
  });
});
