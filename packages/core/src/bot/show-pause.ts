// The bot's pause before a move in a show (spec 2026-11-09-show-mode, P9): a condition of "the move is due",
// not a sleep in a request. Deterministic, so a read after a restart waits for the same moment.

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
