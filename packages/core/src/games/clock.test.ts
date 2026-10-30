import { describe, expect, it } from "vitest";

import {
  LOW_TIME_MS,
  clockView,
  deadlineMs,
  elapsedMs,
  isLow,
  remainingMs,
  seatOutOfTime,
  spend,
  type ClockState,
} from "./clock";
import { INITIAL_CLOCK_MS } from "./constants";

const T0 = 1_000_000;
const running = (over: Partial<ClockState> = {}): ClockState => ({
  clockMs: [INITIAL_CLOCK_MS, INITIAL_CLOCK_MS],
  turnStartedAtMs: T0,
  turnSeat: 1,
  ...over,
});

describe("game clock", () => {
  it("gives each player ten minutes", () => {
    expect(INITIAL_CLOCK_MS).toBe(600_000);
    expect(LOW_TIME_MS).toBe(60_000);
  });

  it("does not run before the start, for the waiting player or after the game", () => {
    const notStarted = running({ turnStartedAtMs: null });
    expect(elapsedMs(notStarted, T0 + 5000)).toBe(0);
    expect(remainingMs(notStarted, 1, T0 + 5000)).toBe(INITIAL_CLOCK_MS);
    expect(clockView(notStarted, T0 + 5000)).toEqual({
      remainingMs: [INITIAL_CLOCK_MS, INITIAL_CLOCK_MS],
      running: null,
    });
    expect(remainingMs(running(), 2, T0 + 5000)).toBe(INITIAL_CLOCK_MS);
    const over = running({ turnSeat: null });
    expect(remainingMs(over, 1, T0 + 5000)).toBe(INITIAL_CLOCK_MS);
    expect(clockView(over, T0 + 5000).running).toBeNull();
  });

  it("counts down only the player on turn, to the millisecond", () => {
    const state = running({ clockMs: [500_000, 400_000], turnSeat: 2 });
    expect(remainingMs(state, 2, T0 + 1)).toBe(399_999);
    expect(remainingMs(state, 1, T0 + 1)).toBe(500_000);
    expect(clockView(state, T0 + 1_000)).toEqual({
      remainingMs: [500_000, 399_000],
      running: 2,
    });
  });

  it("never goes below zero or above ten minutes, and survives a clock set back", () => {
    expect(remainingMs(running(), 1, T0 + 10 * INITIAL_CLOCK_MS)).toBe(0);
    expect(remainingMs(running(), 1, T0 - 5000)).toBe(INITIAL_CLOCK_MS);
    expect(elapsedMs(running(), T0 - 5000)).toBe(0);
    expect(remainingMs(running({ clockMs: [INITIAL_CLOCK_MS * 2, 0] }), 1, T0)).toBe(INITIAL_CLOCK_MS);
    expect(remainingMs(running({ clockMs: [-5, 0] }), 1, T0)).toBe(0);
  });

  it("charges the elapsed time on a move and flags the move at or after the deadline", () => {
    const state = running({ clockMs: [10_000, 600_000] });
    expect(spend(state, 1, T0)).toEqual({ clockMs: 10_000, expired: false });
    expect(spend(state, 1, T0 + 9_999)).toEqual({ clockMs: 1, expired: false });
    expect(spend(state, 1, T0 + 10_000)).toEqual({ clockMs: 0, expired: true });
    expect(spend(state, 1, T0 + 20_000)).toEqual({ clockMs: 0, expired: true });
    expect(spend(state, 1, T0 - 1)).toEqual({ clockMs: 10_000, expired: false });
  });

  it("charges nothing to a player who is not on turn or before the start", () => {
    expect(spend(running({ clockMs: [100, 200] }), 2, T0 + 50)).toEqual({ clockMs: 200, expired: false });
    expect(spend(running({ turnStartedAtMs: null }), 1, T0 + 50)).toEqual({
      clockMs: INITIAL_CLOCK_MS,
      expired: false,
    });
    expect(spend(running({ clockMs: [0, 5] }), 1, T0).expired).toBe(true);
  });

  it("finds the deadline and who ran out of time", () => {
    const state = running({ clockMs: [30_000, 600_000] });
    expect(deadlineMs(state)).toBe(T0 + 30_000);
    expect(deadlineMs(running({ turnStartedAtMs: null }))).toBeNull();
    expect(deadlineMs(running({ turnSeat: null }))).toBeNull();
    expect(seatOutOfTime(state, T0 + 29_999)).toBeNull();
    expect(seatOutOfTime(state, T0 + 30_000)).toBe(1);
    expect(seatOutOfTime(state, T0 + 99_000)).toBe(1);
    expect(seatOutOfTime(running({ turnStartedAtMs: null }), T0 + 9e9)).toBeNull();
  });

  it("flags low time below sixty seconds", () => {
    expect(isLow(60_000)).toBe(false);
    expect(isLow(59_999)).toBe(true);
    expect(isLow(0)).toBe(true);
  });

  it("never spends more than ten minutes over a whole game (property)", () => {
    // Deterministic pseudo-random sequence of think times for one player.
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % 90_000;
    let clockMs = INITIAL_CLOCK_MS;
    let spent = 0;
    for (let move = 0; move < 100 && clockMs > 0; move++) {
      const think = next();
      const state = running({ clockMs: [clockMs, INITIAL_CLOCK_MS] });
      const result = spend(state, 1, T0 + think);
      spent += clockMs - result.clockMs;
      clockMs = result.clockMs;
    }
    expect(spent).toBeLessThanOrEqual(INITIAL_CLOCK_MS);
    expect(clockMs).toBeGreaterThanOrEqual(0);
  });
});
