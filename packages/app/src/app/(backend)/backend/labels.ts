import type { PairCounter } from "@gomoku/core";

export const STATUS_LABELS = [
  ["waiting", "oczekujące"],
  ["active", "trwające"],
  ["finished", "zakończone"],
  ["cancelled", "anulowane"],
] as const;

export const ORIGIN_LABELS = [
  ["invite", "z zaproszenia"],
  ["lobby", "z lobby"],
  ["rematch", "rewanż"],
] as const;

export const END_REASON_LABELS = [
  ["five_in_row", "pięć w linii"],
  ["draw", "remis"],
  ["timeout", "czas"],
  ["resignation", "poddanie"],
] as const;

const KIND_LABELS: Record<string, string> = { account: "konto", guest: "gość", agent: "agent" };

/** "konto – gość" for a pair of participant kinds; an unknown kind is shown as it is. */
export function pairLabel({ kinds }: Pick<PairCounter, "kinds">): string {
  return kinds.map((kind) => KIND_LABELS[kind] ?? kind).join(" – ");
}

const DATE_TIME = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  dateStyle: "short",
  timeStyle: "short",
});

export const formatDateTime = (date: Date) => DATE_TIME.format(date);
