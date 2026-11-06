// The bot's budget for one move (spec 2026-11-05-hosted-bot, R6, R7, BR-57): the memory frozen at the
// creation of the game picks the table and the depth of level 2, and the time is always bounded by the
// soft target and the ceiling, both cut further by what is left on the bot's clock.
import type { BotLevel, SearchBudget } from "./choose-move";
import { botTierOf, type BotTier } from "./profile";

/** The soft target and the ceiling of one move of a level (R6). */
export type BotTimeLimits = { softMs: number; ceilingMs: number };

/** The R6 starting values: level 1 50/250 ms, level 2 1500/3000 ms (`BOT_L*_SOFT_MS`/`_CEILING_MS`). */
export const DEFAULT_BOT_TIME_LIMITS: Readonly<Record<BotLevel, BotTimeLimits>> = {
  1: { softMs: 50, ceilingMs: 250 },
  2: { softMs: 1500, ceilingMs: 3000 },
};

/** Below this much on the bot's clock it plays a level-1 move whatever its level (R6). */
export const BOT_LOW_CLOCK_MS = 1000;

/** The largest value of the `smallint` columns the frozen memory is stored in (`bot_memory_mb`). */
export const BOT_MEMORY_MB_MAX = 32_767;

/** The level-2 tier of a seat stored without parameters (the CHECKs forbid it; a guard, not a path). */
const FALLBACK_TIER: BotTier = { ttMb: 8, depthCap: 6 };

/** A memory reading as a whole number of megabytes that fits `bot_memory_mb` (`smallint`, R10). */
export function clampBotMemoryMb(memoryMb: number): number {
  if (!Number.isFinite(memoryMb) || memoryMb <= 0) return 0;
  return Math.min(Math.floor(memoryMb), BOT_MEMORY_MB_MAX);
}

/** What a game with the bot freezes in the bot's seat (BR-57): level 2 keeps the memory and its depth limit. */
export type BotStrength = { level: BotLevel; memoryMb: number | null; depthCap: number | null };

/**
 * The strength of a new game's bot from the available memory (R7), or `null` when there is too little
 * memory for any tier (the game is refused). Level 1 does not use the memory and stores none (R9).
 */
export function botStrengthFor(level: BotLevel, availableMb: number): BotStrength | null {
  const memoryMb = clampBotMemoryMb(availableMb);
  const tier = botTierOf(memoryMb);
  if (!tier) return null;
  return level === 1 ? { level, memoryMb: null, depthCap: null } : { level, memoryMb, depthCap: tier.depthCap };
}

export type BudgetInput = {
  level: BotLevel;
  /** Frozen at creation (level 2 only). */
  memoryMb: number | null;
  depthCap: number | null;
  /** What is left on the bot's clock when the computation starts. */
  remainingClockMs: number;
  limits: Readonly<Record<BotLevel, BotTimeLimits>>;
};

/** The level actually played and its search budget: level 2 drops to level 1 on a low clock (R6). */
export type BotMoveBudget = { level: BotLevel; budget: SearchBudget };

/**
 * The budget of one move (R6, R7): `softMs = min(target, remaining / 30)`, `ceilingMs = min(ceiling,
 * remaining / 10)`; under `BOT_LOW_CLOCK_MS` on the clock the move is a level-1 one. Memory picks only
 * the table and the depth, never the time (BR-57).
 */
export function budgetFor({ level, memoryMb, depthCap, remainingClockMs, limits }: BudgetInput): BotMoveBudget {
  const played: BotLevel = remainingClockMs < BOT_LOW_CLOCK_MS ? 1 : level;
  const remaining = Math.max(0, remainingClockMs);
  const { softMs, ceilingMs } = limits[played];
  const time = {
    softMs: Math.min(softMs, Math.floor(remaining / 30)),
    ceilingMs: Math.min(ceilingMs, Math.floor(remaining / 10)),
  };
  if (played === 1) return { level: 1, budget: { ...time, maxDepth: 1, ttBytes: 0 } };
  const tier = (memoryMb === null ? null : botTierOf(memoryMb)) ?? FALLBACK_TIER;
  return {
    level: 2,
    budget: { ...time, maxDepth: depthCap ?? tier.depthCap, ttBytes: tier.ttMb * 1024 * 1024 },
  };
}
