import type { GameStatus } from "@gomoku/core/games/types";

/**
 * Reading the state of a game as a spectator (E10-S02, Q-17): short polling, the same pace as a
 * player's game in progress (`PLAY_POLL_INTERVAL_MS` of the game room). Measured at 20 spectators:
 * a move reaches them after 1.0 s on average and 1.9 s at worst, and the players' moves are not slowed.
 */
export const SPECTATOR_POLL_INTERVAL_MS = 2000;
/** After this long without a move the pace drops (lesson 2026-10-30): a game nobody plays is read less often. */
export const SPECTATOR_IDLE_AFTER_MS = 60 * 1000;
export const SPECTATOR_IDLE_POLL_INTERVAL_MS = 5000;
/** Failed reads in a row before the banner appears; fewer show only a quiet line. */
export const SPECTATOR_FAILURES_BEFORE_BANNER = 3;

/**
 * The pause before the next read, or `null` when none is due: a game that is over (its result came
 * with the last answer) or void is not read again. `idleMs` is the time since the last move seen, on
 * the browser's monotonic clock.
 */
export function spectatorPollDelay(status: GameStatus, idleMs: number): number | null {
  if (status !== "active") return null;
  return idleMs >= SPECTATOR_IDLE_AFTER_MS ? SPECTATOR_IDLE_POLL_INTERVAL_MS : SPECTATOR_POLL_INTERVAL_MS;
}
