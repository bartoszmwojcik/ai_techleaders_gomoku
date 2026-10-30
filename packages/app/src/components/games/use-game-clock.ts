"use client";

import type { ClockView } from "@gomoku/core/games/clock";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Options = {
  /** A finished game freezes the clocks at what the server last said. */
  finished?: boolean;
  /**
   * Called once per server answer when the running clock reaches zero locally. The caller reads the
   * state from the server at once: the server alone decides that the time is up (#23).
   */
  onExpire?: () => void;
};

/**
 * The browser's monotonic clock as an external store: `sample()` takes a reading and tells the
 * subscribers. `arrive()` also remembers when each server answer arrived, which is the moment the
 * answer's `now` (server time) is matched with the browser's clock.
 */
class ClockSource {
  // A new object per reading: even two readings of the same value are a change for React.
  #reading = { at: 0 };
  readonly #listeners = new Set<() => void>();
  readonly #arrivals = new WeakMap<ClockView, number>();

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Latest reading; `at` is `0` until the first one (also the server render's snapshot). */
  reading = () => this.#reading;

  sample() {
    this.#reading = { at: performance.now() };
    this.#listeners.forEach((listener) => listener());
  }

  arrive(clock: ClockView) {
    this.#arrivals.set(clock, performance.now());
    this.sample();
  }

  /** Browser clock reading at which `clock` arrived, or `undefined` before the effect saw it. */
  arrivedAt(clock: ClockView): number | undefined {
    return this.#arrivals.get(clock);
  }
}

/**
 * Local countdown of the game clock between two answers of the server (#23 step 8). Every answer
 * brings the server's time (`clock.now`): the offset between it and the browser's monotonic clock
 * is measured again with each answer, so the countdown follows the server's time and never the
 * wall clock of the browser. Only the clock of the player on turn runs; it stops at zero, and a
 * finished game or a clock that has not started stays as the server sent it. The first render
 * (also on the server) shows the server's values untouched, so the markup matches on hydration.
 *
 * The value is for display only and never goes back to the server.
 */
export function useGameClock(clock: ClockView, { finished = false, onExpire }: Options = {}) {
  const [source] = useState(() => new ClockSource());
  const localNow = useSyncExternalStore(source.subscribe, source.reading, source.reading).at;
  const expire = useRef(onExpire);

  useEffect(() => {
    expire.current = onExpire;
  });

  const running = finished ? null : clock.running;
  const arrivedAt = source.arrivedAt(clock);
  // Server time now = the browser's clock + the offset measured when this answer arrived.
  const offset = arrivedAt === undefined ? 0 : clock.now - arrivedAt;

  function remainingOf(seat: 1 | 2): number {
    const base = clock.remainingMs[seat - 1]!;
    if (arrivedAt === undefined || running !== seat) return base;
    return Math.max(0, base - (localNow + offset - clock.now));
  }

  useEffect(() => {
    source.arrive(clock);
  }, [source, clock]);

  const left = running === null || arrivedAt === undefined ? null : remainingOf(running);

  useEffect(() => {
    if (left === null) return;
    if (left <= 0) {
      // Once per answer and per second reached: the effect depends on `left` and `clock`, nothing else.
      expire.current?.();
      return;
    }
    // The shown seconds round up: the next change is when the time drops to the next full second.
    const timer = setTimeout(() => source.sample(), left - (Math.ceil(left / 1000) - 1) * 1000);
    return () => clearTimeout(timer);
  }, [source, left, clock]);

  return {
    remainingMs: [remainingOf(1), remainingOf(2)] as [number, number],
    /** The effect has seen the answer: from here on the values are live (not the server render's). */
    live: arrivedAt !== undefined,
  };
}
