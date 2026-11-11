import { randomUUID } from "node:crypto";

import { createBitboard, type BotLevel, type BotTimeLimits } from "@gomoku/core";

import { botFailures, createWorkerBotEngine, type BotEngine } from "./bot-engine";
import { computeGate, type ComputeGate } from "./compute-gate";

type Logger = Pick<Console, "info" | "warn" | "error">;

/** The trial move of the show's preflight (P18): the thread answered with a level-1 move within its ceiling. */
export type EngineTrial = {
  ok: boolean;
  /** The move's own time in the thread (from its `bot_move` line); the whole call when the thread gave none. */
  ms: number;
  /** The ceiling the move had to fit in (`BOT_L1_CEILING_MS`, 250 ms by default). */
  limitMs: number;
  /** How long the trial waited for the gate behind other games' moves (not counted against the limit). */
  waitedMs: number;
};

/** What the show reads of the engine: a trial move (the preflight) and how many moves wait for the gate. */
export interface BotEngineStatus {
  trial(): Promise<EngineTrial>;
  /** Computations queued or running in this process (`ComputeGate.pending`). */
  pending(): number;
}

export type BotEngineStatusDeps = {
  limits: Readonly<Record<BotLevel, BotTimeLimits>>;
  gate?: ComputeGate;
  /** The engine of the trial; by default the worker engine of the app behind `gate`. */
  createEngine?: (logger: Logger) => BotEngine;
  now?: () => number;
  /** Where the engine's warnings and errors of a trial go (the operator's log). */
  logger?: Pick<Console, "warn" | "error">;
};

/**
 * The engine as the show's preflight sees it (spec 2026-11-09-show-mode, P18): one level-1 move on an empty board
 * through the production path — a worker thread behind the process-wide `ComputeGate` — passes when the thread
 * answers within the level-1 ceiling. The engine never fails a move (it falls back to an inline level 1), so the
 * trial reads its log: a move without a `bot_move` line, or with a warning or an error, is a failed trial. Each trial
 * has its own game id, whose failure count is forgotten after it, so a failed trial does not pin later ones to the
 * inline fallback.
 */
export function createBotEngineStatus({
  limits,
  gate = computeGate(),
  createEngine = (logger) => createWorkerBotEngine({ limits, gate, logger }),
  now = () => performance.now(),
  logger = console,
}: BotEngineStatusDeps): BotEngineStatus {
  return {
    pending: () => gate.pending,
    async trial() {
      const gameId = `preflight-${randomUUID()}`;
      let moveMs: number | null = null;
      let problem = false;
      const engine = createEngine({
        info: (line: string) => {
          moveMs = (JSON.parse(line) as { ms: number }).ms;
        },
        warn: (line: string) => {
          problem = true;
          logger.warn(line);
        },
        error: (line: string) => {
          problem = true;
          logger.error(line);
        },
      });
      const started = now();
      try {
        await engine.choose({
          gameId,
          moveNumber: 1,
          position: { black: createBitboard(), white: createBitboard(), moveCount: 0 },
          level: 1,
          depthCap: null,
          memoryMb: null,
          remainingClockMs: 600_000,
        });
      } finally {
        botFailures().delete(gameId);
      }
      const total = Math.round(now() - started);
      const limitMs = limits[1].ceilingMs;
      const ms: number = moveMs ?? total;
      return { ok: moveMs !== null && !problem && ms <= limitMs, ms, limitMs, waitedMs: Math.max(0, total - ms) };
    },
  };
}
