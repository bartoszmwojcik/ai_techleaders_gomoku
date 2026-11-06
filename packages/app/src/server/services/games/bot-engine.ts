import {
  BOARD_CELLS,
  botTierOf,
  chooseMove,
  hasStone,
  type BotLevel,
  type BotPosition,
  type ChooseMoveInput,
  type MoveChoice,
  type Rng,
} from "@gomoku/core";

/** What the bot knows when it is to move: the position and its frozen strength (BR-57), with a seeded `rng` (R16). */
export type BotTurn = {
  position: BotPosition;
  level: BotLevel;
  /** Level 2 only: the depth limit and the memory its table size comes from (R7). */
  depthCap: number | null;
  memoryMb: number | null;
  rng: Rng;
};

/**
 * Computes the bot's move: a free cell of the board. Injected into `BotTurnService`, so E13-S04 can put
 * the search in a worker thread with a hard ceiling without touching the turn logic.
 */
export interface BotEngine {
  choose(turn: BotTurn): number;
}

/**
 * The fixed budget of E13-S02, computed on the main thread. The search blocks the event loop while it
 * runs, so level 2 gets far less than the R6 target (1.5 s / 3 s): E13-S04 moves it to a worker and
 * reads the budget from the bot's clock and the memory tier (`budgetFor`).
 */
export const MAIN_THREAD_BUDGET = { softMs: 250, ceilingMs: 500 } as const;

/** Depth and table of a level-2 seat without parameters (never written: the CHECKs require them). */
const FALLBACK_TIER = { depthCap: 6, ttMb: 8 };

type EngineDeps = {
  choose?: (input: ChooseMoveInput) => MoveChoice;
  now?: () => number;
};

/**
 * The bot's engine on the main thread (E13-S02). The bot ALWAYS plays a legal move: when the search
 * throws it falls back to level 1, and when that throws too, to the first free cell.
 */
export function createMainThreadBotEngine({ choose = chooseMove, now = () => performance.now() }: EngineDeps = {}): BotEngine {
  return {
    choose(turn) {
      const tier = turn.memoryMb === null ? null : botTierOf(turn.memoryMb);
      const input: ChooseMoveInput = {
        position: turn.position,
        level: turn.level,
        rng: turn.rng,
        now,
        budget: {
          ...MAIN_THREAD_BUDGET,
          maxDepth: turn.depthCap ?? FALLBACK_TIER.depthCap,
          ttBytes: (tier?.ttMb ?? FALLBACK_TIER.ttMb) * 1024 * 1024,
        },
      };
      try {
        return choose(input).cell;
      } catch {
        try {
          return choose({ ...input, level: 1 }).cell;
        } catch {
          return firstFreeCell(turn.position);
        }
      }
    },
  };
}

/** The first empty cell; the service never asks on a full board (`applyMove` ends it with a draw). */
export function firstFreeCell({ black, white }: BotPosition): number {
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    if (!hasStone(black, cell) && !hasStone(white, cell)) return cell;
  }
  return -1;
}
