import type { EndReason, HistoryEntry, HistoryResult } from "@gomoku/core";

import { agentNameOf, type PlayerName } from "./play";
import { VARIANT_NAME } from "./settings";

export const RESULT_LABEL: Record<HistoryResult, string> = {
  win: "Wygrana",
  loss: "Porażka",
  draw: "Remis",
};

// A Record keyed by the reason: a new `EndReason` does not compile until it has a label.
export const REASON_LABEL: Record<EndReason, string> = {
  five_in_row: "5 w linii",
  timeout: "Koniec czasu",
  resignation: "Poddanie",
  draw: "Plansza pełna",
  points: "Punkty",
};

export const DELETED_PLAYER_LABEL = "Usunięty gracz";

/**
 * The opponent as the history names them, in the one place that decides: an account by its name,
 * a deleted account (`name` null) "Usunięty gracz" (BR-17), a guest "{nick} (gość)" (BR-24, BR-29),
 * an agent "Agent" or, when it declared a model name, "Agent · {name} (deklarowane)" (BR-31).
 */
export function opponentNameOf({ kind, name }: HistoryEntry["opponent"]): PlayerName {
  if (kind === "agent") return agentNameOf(name);
  const guest = kind === "guest";
  const nick = name ?? DELETED_PLAYER_LABEL;
  return { nick, guest, label: guest ? `${nick} (gość)` : nick };
}

/**
 * How a finished game is described next to its date: the reason for the classic game; for the paper
 * game its variant and the points ("Papier i ołówek · 7 : 5"), plus the reason when it was not the points.
 */
export function historyDetailOf(entry: Pick<HistoryEntry, "variant" | "scores" | "reason">): string {
  if (entry.variant !== "paper") return REASON_LABEL[entry.reason];
  const [mine, theirs] = entry.scores ?? [0, 0];
  const base = `${VARIANT_NAME.paper} · ${mine} : ${theirs}`;
  return entry.reason === "points" ? base : `${base} · ${REASON_LABEL[entry.reason]}`;
}
