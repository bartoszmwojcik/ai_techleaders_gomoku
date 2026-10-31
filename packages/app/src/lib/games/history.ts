import type { EndReason, HistoryEntry, HistoryResult } from "@gomoku/core";

import { agentNameOf, type PlayerName } from "./play";

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
