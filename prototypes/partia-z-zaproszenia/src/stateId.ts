import { useEffect, useSyncExternalStore } from "react";

// Which map state (pNN.M) each screen shows right now. Screens report it; the review bar prints it for the
// screen on display, so a reviewer can name the state in a comment. A control of the prototype, not a product feature.

let ids: Record<string, string> = {};
let current = "";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
let snapshot = "";
const refresh = () => {
  const next = current ? (ids[current] ?? "") : "";
  if (next !== snapshot) {
    snapshot = next;
    emit();
  }
};

if (typeof document !== "undefined") {
  document.addEventListener("prototype:screen-change", (event) => {
    current = (event as CustomEvent<string>).detail;
    refresh();
  });
}

/** Reports the state id of `screen` (e.g. "p03.2"); several ids are joined with " + " when states overlap. */
export function useStateId(screen: string, id: string) {
  useEffect(() => {
    ids = { ...ids, [screen]: id };
    refresh();
  }, [screen, id]);
}

export function useCurrentStateId(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

export const resetStateIds = () => {
  ids = {};
  refresh();
};
