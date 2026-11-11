// The bot's pause before a move in a show (spec 2026-11-09-show-mode, P9): a condition of "the move is due",
// not a sleep in a request. Deterministic, so a read after a restart waits for the same moment.

import type { BotTimeLimits } from "./budget";
import type { BotLevel } from "./choose-move";
import { seedOf } from "./seed";

/** The range of the pause (`BOT_SHOW_PAUSE_MIN_MS`…`BOT_SHOW_PAUSE_MAX_MS`), `minMs <= maxMs`. */
export type ShowPauseRange = { readonly minMs: number; readonly maxMs: number };

/**
 * The pause of move `moveNumber` (1-based, the move the bot is about to make) of game `gameId`, in whole
 * milliseconds within `[minMs, maxMs]`. A hash of its own (salted), so the pause does not follow the seed of
 * the search (R16) and two games or two moves get different pauses.
 */
export function showPauseMs(gameId: string, moveNumber: number, { minMs, maxMs }: ShowPauseRange): number {
  const span = maxMs - minMs + 1;
  return minMs + (seedOf(`show-pause:${gameId}`, moveNumber) % span);
}

/** The pause never takes more than this share of what is left on the bot's clock (P9: `min(pause, clock / 4)`). */
export const SHOW_PAUSE_CLOCK_DIVISOR = 4;

/**
 * The pause actually waited (P9, "Resource policy & tuning of level 2"): `min(pauseMs, clockMs / 4)`, where `clockMs`
 * is what the bot's clock held when its turn began. On a low clock the bot stops waiting and plays at once, so the
 * pause alone never eats its last seconds; a clock run out gives no pause at all.
 */
export function clipShowPause(pauseMs: number, clockMs: number): number {
  return Math.min(pauseMs, Math.max(0, Math.floor(clockMs / SHOW_PAUSE_CLOCK_DIVISOR)));
}

/**
 * The time limits of a bot's move in a show (`SHOW_BOT_L2_SOFT_MS`): level 2 gets the show's soft target and the
 * ceiling `min(BOT_L2_CEILING_MS, 2 × soft)`, so a show never exceeds the safety ceiling of a normal game; the soft
 * target is kept under that ceiling. Level 1 is unchanged. Ordinary games keep `limits` as they are.
 */
export function showBotLimits(
  limits: Readonly<Record<BotLevel, BotTimeLimits>>,
  l2SoftMs: number,
): Record<BotLevel, BotTimeLimits> {
  const ceilingMs = Math.min(limits[2].ceilingMs, 2 * l2SoftMs);
  return { 1: limits[1], 2: { softMs: Math.min(l2SoftMs, ceilingMs), ceilingMs } };
}
