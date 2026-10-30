// Chess clock of a game (#23): pure functions, the time comes in as a parameter.
import { INITIAL_CLOCK_MS } from "./constants";
import type { Seat } from "./types";

/** Below this the UI flags a clock as low (#23 Q1). */
export const LOW_TIME_MS = 60 * 1000;

/**
 * Clock state as stored in the `games` row: the time left after each player's last move
 * (index 0 is seat 1) and the start of the current turn. `turnSeat` is the seat to move and
 * `null` when nobody is (the game is not `active`); `turnStartedAtMs` is `null` until both
 * players have opened the game (#21 Q20).
 */
export type ClockState = {
  clockMs: readonly [number, number];
  turnStartedAtMs: number | null;
  turnSeat: Seat | null;
};

/** What the API tells a client about the clock (#23 API Contracts). */
export type ClockView = {
  remainingMs: [number, number];
  /** Seat whose clock is running; `null` before the clock started and after the game. */
  running: Seat | null;
};

const stored = (state: ClockState, seat: Seat): number =>
  Math.min(Math.max(state.clockMs[seat - 1]!, 0), INITIAL_CLOCK_MS);

/** Time spent in the current turn; never negative, so a clock set back (NTP) costs nothing. */
export function elapsedMs(state: ClockState, nowMs: number): number {
  if (state.turnStartedAtMs === null) return 0;
  return Math.max(0, nowMs - state.turnStartedAtMs);
}

/** Whether the clock of `seat` is running at all. */
function isRunning(state: ClockState, seat: Seat): boolean {
  return state.turnSeat === seat && state.turnStartedAtMs !== null;
}

/** Time left to `seat` at `nowMs`; only the player on turn loses time. */
export function remainingMs(state: ClockState, seat: Seat, nowMs: number): number {
  const base = stored(state, seat);
  return isRunning(state, seat) ? Math.max(0, base - elapsedMs(state, nowMs)) : base;
}

/**
 * Charges the time of the current turn to `seat` for a move made at `nowMs`. `expired` when
 * nothing was left (a move at exactly the deadline is too late, #23 Edge Cases).
 */
export function spend(
  state: ClockState,
  seat: Seat,
  nowMs: number,
): { clockMs: number; expired: boolean } {
  const left = stored(state, seat) - (isRunning(state, seat) ? elapsedMs(state, nowMs) : 0);
  return { clockMs: Math.max(0, left), expired: left <= 0 };
}

/** Moment the clock of the player on turn runs out, or `null` when no clock is running. */
export function deadlineMs(state: ClockState): number | null {
  if (state.turnSeat === null || state.turnStartedAtMs === null) return null;
  return state.turnStartedAtMs + stored(state, state.turnSeat);
}

/** The seat that lost on time at `nowMs`, or `null` (deadline reached counts as lost). */
export function seatOutOfTime(state: ClockState, nowMs: number): Seat | null {
  const deadline = deadlineMs(state);
  return deadline !== null && nowMs >= deadline ? state.turnSeat : null;
}

/** Both clocks at `nowMs` as the API serves them. */
export function clockView(state: ClockState, nowMs: number): ClockView {
  return {
    remainingMs: [remainingMs(state, 1, nowMs), remainingMs(state, 2, nowMs)],
    running: state.turnStartedAtMs === null ? null : state.turnSeat,
  };
}

/** Whether a clock with `remaining` ms left is shown as low on time. */
export function isLow(remaining: number): boolean {
  return remaining < LOW_TIME_MS;
}
