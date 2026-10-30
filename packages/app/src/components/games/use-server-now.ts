"use client";

import type { ClockView } from "@gomoku/core/games/clock";
import { useCallback, useSyncExternalStore } from "react";

// When each server answer first reached this page, on the browser's monotonic clock. The pair
// (`clock.now`, arrival) is what matches the server's time with the browser's; the wall clock of
// the browser (`Date.now`) is never used, so a skewed device clock changes nothing.
const arrivals = new WeakMap<ClockView, number>();

/**
 * The server's current time (epoch ms), estimated from the newest answer: its `clock.now` plus the
 * browser's monotonic time elapsed since the answer arrived. Idempotent per answer, so a render
 * may call it any number of times.
 */
export function serverNowMs(clock: ClockView): number {
  const at = performance.now();
  if (!arrivals.has(clock)) arrivals.set(clock, at);
  return clock.now + (at - arrivals.get(clock)!);
}

const nowOnServer = () => null;

/**
 * Server time for a countdown that ticks once a second while `ticking`. `null` on the server and
 * while hydrating, so both print the same markup. The snapshot holds still within a second, so the
 * store is stable between two reads of one render.
 */
export function useServerNow(clock: ClockView, ticking: boolean): number | null {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!ticking) return () => {};
      const timer = setInterval(notify, 1000);
      return () => clearInterval(timer);
    },
    [ticking],
  );
  // Registers the arrival during the render that first sees this answer.
  serverNowMs(clock);
  const snapshot = useCallback(() => Math.floor(serverNowMs(clock) / 1000) * 1000, [clock]);
  return useSyncExternalStore(subscribe, snapshot, nowOnServer);
}
