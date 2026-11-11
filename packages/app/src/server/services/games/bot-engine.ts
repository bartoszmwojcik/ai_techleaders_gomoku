import {
  BOARD_CELLS,
  budgetFor,
  chooseMove,
  hasStone,
  rngFor,
  type BotLevel,
  type BotPosition,
  type BotTimeLimits,
  type MoveChoice,
  type SearchBudget,
} from "@gomoku/core";

import { BOT_JOB_KIND, type BotJob, type BotWorkerMessage } from "./bot-worker";
import { spawnBotWorker } from "./bot-worker-spawn";
import { computeGate, type ComputeGate } from "./compute-gate";

/** What the bot knows when it is to move: the position, its frozen strength (BR-57) and its clock. */
export type BotTurn = {
  gameId: string;
  /** The move the bot is about to make (1-based): with `gameId` the seed of its randomness (R16). */
  moveNumber: number;
  position: BotPosition;
  level: BotLevel;
  /** Level 2 only: the depth limit and the memory its table size comes from (R7). */
  depthCap: number | null;
  memoryMb: number | null;
  /** What was left on the bot's clock when the position was read (R6). */
  remainingClockMs: number;
  /** Replaces the engine's limits for this move: only a show's bots (`SHOW_BOT_L2_SOFT_MS`, `showBotLimits`). */
  limits?: Readonly<Record<BotLevel, BotTimeLimits>>;
};

/** Computes the bot's move: always a free cell of the board. Injected into `BotTurnService`. */
export interface BotEngine {
  choose(turn: BotTurn): Promise<number>;
}

/** The part of a `Worker` the runner uses (`vi.mock('node:worker_threads')` fakes it in tests). */
export type BotWorkerHandle = {
  on(event: "message", listener: (message: BotWorkerMessage) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  terminate(): Promise<number>;
};

/** Failures of the thread in one game after which the bot plays level 1 inline to the end (Edge Cases). */
export const BOT_MAX_FAILURES = 3;
/** Games whose failures are remembered; the oldest is forgotten beyond it (bounded memory). */
export const BOT_FAILURE_GAMES = 1000;
/**
 * How long the gate waits for a killed thread to end before letting the next computation in: the move
 * is held back until then, so two threads (and their heaps) never overlap (R8). `terminate()` takes
 * milliseconds; the bound only keeps a stuck one from blocking the gate for good.
 */
export const BOT_TERMINATE_WAIT_MS = 500;

// Per process, on `globalThis` like the gate: pages and routes hold separate copies of this module.
const globalForFailures = globalThis as typeof globalThis & { __gomokuBotFailures?: Map<string, number> };

export function botFailures(): Map<string, number> {
  return (globalForFailures.__gomokuBotFailures ??= new Map());
}

function recordFailure(gameId: string): number {
  const failures = botFailures();
  const count = (failures.get(gameId) ?? 0) + 1;
  failures.delete(gameId);
  failures.set(gameId, count);
  if (failures.size > BOT_FAILURE_GAMES) failures.delete(failures.keys().next().value!);
  return count;
}

type Logger = Pick<Console, "info" | "warn" | "error">;

export type WorkerEngineDeps = {
  /** `BOT_L*_SOFT_MS`/`_CEILING_MS` (R6). */
  limits: Readonly<Record<BotLevel, BotTimeLimits>>;
  spawn?: (job: BotJob) => BotWorkerHandle;
  gate?: ComputeGate;
  now?: () => number;
  logger?: Logger;
};

/**
 * The bot's engine in a worker thread (spec 2026-11-05-hosted-bot R5, R6, R8): one thread per move,
 * one computation at a time in the process (`ComputeGate`). After `softMs` the stop flag in a
 * `SharedArrayBuffer` asks the search to end — never before its first completed iteration, so a low
 * clock does not cut level 2 down to the fallback; after `ceilingMs` (hard) the thread is killed and
 * the last completed iteration is played. The move is returned (and the gate released) only once the
 * thread has ended (`terminate()`, bounded by `BOT_TERMINATE_WAIT_MS`). A thread that fails or exits
 * without a move is replaced by a level-1 move computed inline (< 5 ms); after `BOT_MAX_FAILURES` in a
 * game the bot stays on that inline level 1 to its end. The bot ALWAYS plays a legal move. Logs never carry the position.
 */
export function createWorkerBotEngine({
  limits,
  spawn = spawnBotWorker,
  gate = computeGate(),
  now = () => performance.now(),
  logger = console,
}: WorkerEngineDeps): BotEngine {
  function compute(turn: BotTurn, level: BotLevel, budget: SearchBudget): Promise<number> {
    return new Promise<number>((resolve) => {
      const stop = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const timers: ReturnType<typeof setTimeout>[] = [];
      let last: MoveChoice | null = null;
      let worker: BotWorkerHandle | null = null;
      let settled = false;
      // The soft target passed with no completed iteration yet: the flag waits for the first one.
      let softPassed = false;
      const raiseStop = () => Atomics.store(new Int32Array(stop), 0, 1);
      const base = { gameId: turn.gameId, moveNumber: turn.moveNumber, level };
      const startedAt = now();

      // Called once: every caller checks `settled`, and the timers are cleared with it.
      const finish = (cell: number) => {
        settled = true;
        timers.forEach(clearTimeout);
        if (!worker) return resolve(cell);
        const waited = setTimeout(() => resolve(cell), BOT_TERMINATE_WAIT_MS);
        void worker
          .terminate()
          .catch(() => undefined)
          .then(() => {
            clearTimeout(waited);
            resolve(cell);
          });
      };
      const fail = (error: Error) => {
        if (settled) return;
        const failures = recordFailure(turn.gameId);
        logger.error(
          JSON.stringify({ event: "bot_engine_error", ts: new Date().toISOString(), ...base, failures, error: error.name, message: error.message }),
        );
        finish(last?.cell ?? inlineLevel1(turn));
      };

      const job: BotJob = {
        kind: BOT_JOB_KIND,
        gameId: turn.gameId,
        moveNumber: turn.moveNumber,
        position: turn.position,
        level,
        budget,
        stop,
      };
      try {
        worker = spawn(job);
      } catch (error) {
        fail(error as Error);
        return;
      }
      worker.on("message", (message) => {
        // A move that arrives after the ceiling is not played and not logged.
        if (settled) return;
        if (message.type === "iteration") {
          last = message.choice;
          if (softPassed) raiseStop();
          return;
        }
        const { cell, depth, nodes, stoppedBy } = message.choice;
        // One line per computed move (no position): the operator's view of the real cost (A-22).
        logger.info(
          JSON.stringify({ event: "bot_move", ts: new Date().toISOString(), ...base, depth, nodes, stoppedBy, ms: Math.round(now() - startedAt) }),
        );
        finish(cell);
      });
      worker.on("error", fail);
      worker.on("exit", (code) => fail(new Error(`The bot's thread exited with code ${code} before a move`)));
      timers.push(
        setTimeout(() => {
          if (last) raiseStop();
          else softPassed = true;
        }, budget.softMs),
        setTimeout(() => {
          logger.warn(
            JSON.stringify({ event: "bot_ceiling", ts: new Date().toISOString(), ...base, ceilingMs: budget.ceilingMs, depth: last?.depth ?? null }),
          );
          finish(last?.cell ?? inlineLevel1(turn));
        }, budget.ceilingMs),
      );
    });
  }

  return {
    choose(turn) {
      const queuedAt = now();
      return gate.run(async () => {
        // The bot's clock ran while the move waited for the gate.
        const remainingClockMs = turn.remainingClockMs - (now() - queuedAt);
        if ((botFailures().get(turn.gameId) ?? 0) >= BOT_MAX_FAILURES) return inlineLevel1(turn);
        const { level, budget } = budgetFor({ ...turn, remainingClockMs, limits: turn.limits ?? limits });
        // No time for a thread at all (the clock is about to run out): no point in starting one.
        if (budget.ceilingMs <= 0) return inlineLevel1(turn);
        return compute(turn, level, budget);
      });
    },
  };
}

const INLINE_BUDGET: SearchBudget = { softMs: 0, ceilingMs: 0, maxDepth: 1, ttBytes: 0 };

/**
 * A level-1 move on the main thread (no search: well under 5 ms), the fallback of a failed or late
 * thread; the first free cell when even that throws.
 */
export function inlineLevel1(turn: Pick<BotTurn, "gameId" | "moveNumber" | "position">): number {
  try {
    return chooseMove({
      position: turn.position,
      level: 1,
      budget: INLINE_BUDGET,
      rng: rngFor(turn.gameId, turn.moveNumber),
      // Level 1 never reads the time.
      now: Date.now,
    }).cell;
  } catch {
    return firstFreeCell(turn.position);
  }
}

/** The first empty cell; the service never asks on a full board (`applyMove` ends it with a draw). */
export function firstFreeCell({ black, white }: BotPosition): number {
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    if (!hasStone(black, cell) && !hasStone(white, cell)) return cell;
  }
  return -1;
}
