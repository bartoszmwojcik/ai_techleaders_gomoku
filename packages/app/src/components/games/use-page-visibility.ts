"use client";

import { shouldShowReturnNotice } from "@gomoku/core/games/return-notice";
import { useEffect, useRef, useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
const isHidden = () => document.visibilityState === "hidden";
// The server cannot know; the first render says "visible".
const visibleOnServer = () => false;

type Options = {
  /** The tab became visible again after having been hidden; `longAbsence` is the #24 Q2 rule. */
  onReturn: (away: { awayMs: number; longAbsence: boolean }) => void;
  /** The clock the absence is measured with; injected by tests. */
  now?: () => number;
};

/**
 * Whether the tab is hidden, and a callback for the moment it comes back (#24 steps 1-2). The
 * absence is measured from the `visibilitychange` that hid the tab to the one that showed it; a
 * "visible" without a prior "hidden" is no return. Time comes from `now` (`Date.now` by default).
 */
export function usePageVisibility({ onReturn, now = () => Date.now() }: Options): boolean {
  const hidden = useSyncExternalStore(subscribe, isHidden, visibleOnServer);
  const hiddenAt = useRef<number | null>(null);
  const handler = useRef(onReturn);
  const clock = useRef(now);

  useEffect(() => {
    handler.current = onReturn;
    clock.current = now;
  });

  useEffect(() => {
    const onChange = () => {
      const at = clock.current();
      if (document.visibilityState === "hidden") {
        hiddenAt.current ??= at;
        return;
      }
      const since = hiddenAt.current;
      hiddenAt.current = null;
      if (since === null) return;
      handler.current({
        awayMs: Math.max(0, at - since),
        longAbsence: shouldShowReturnNotice({ hiddenAtMs: since, returnedAtMs: at }),
      });
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return hidden;
}
