import type { EndReason, HistoryEntry, HistoryResult } from "@gomoku/core";

import plHistory from "@/i18n/catalogs/pl/history";
import { textsOf, type TranslatorOf } from "@/i18n/client";

import { playerNameOf, PL_COMMON, type CommonTranslator, type PlayerName } from "./player-name";
import { PL_HOME, variantName, type HomeTranslator } from "./settings";

export type HistoryTranslator = TranslatorOf<"history">;

export const PL_HISTORY: HistoryTranslator = textsOf<"history">(plHistory);

const RESULTS: readonly HistoryResult[] = ["win", "loss", "draw"];
// A Record keyed by the reason: a new `EndReason` does not compile until it has a label in the catalog.
const REASONS: Record<EndReason, true> = { five_in_row: true, timeout: true, resignation: true, draw: true, points: true };

export const resultLabel = (result: HistoryResult, t: HistoryTranslator = PL_HISTORY): string => t(`result.${result}`);
export const reasonLabel = (reason: EndReason, t: HistoryTranslator = PL_HISTORY): string => t(`reason.${reason}`);

export const RESULT_LABEL = Object.fromEntries(RESULTS.map((result) => [result, resultLabel(result)])) as Record<HistoryResult, string>;
export const REASON_LABEL = Object.fromEntries(
  (Object.keys(REASONS) as EndReason[]).map((reason) => [reason, reasonLabel(reason)]),
) as Record<EndReason, string>;

/**
 * The opponent as the history names them, through the one name helper (I14): an account by its name, a deleted
 * account "Usunięty gracz" (BR-17), a guest "{nick} (gość)" with the default nickname translated (BR-24, BR-29, Q11),
 * an agent "Agent" or "Agent · {name} (deklarowane)" (BR-31), the bot by its strength (hosted-bot R9, E13-S05).
 */
export function opponentNameOf({ kind, name, bot }: HistoryEntry["opponent"], t: CommonTranslator = PL_COMMON): PlayerName {
  return playerNameOf({ kind, displayName: name, ...(kind === "agent" && { agentName: name }), ...(bot && { bot }) }, t);
}

/**
 * How a finished game is described next to its date: the reason for the classic game; for the paper
 * game its variant and the points ("Papier i ołówek · 7 : 5"), plus the reason when it was not the points.
 */
export function historyDetailOf(
  entry: Pick<HistoryEntry, "variant" | "scores" | "reason">,
  t: HistoryTranslator = PL_HISTORY,
  home: HomeTranslator = PL_HOME,
): string {
  if (entry.variant !== "paper") return reasonLabel(entry.reason, t);
  const [mine, theirs] = entry.scores ?? [0, 0];
  const base = { variant: variantName("paper", home), score: `${mine} : ${theirs}` };
  return entry.reason === "points" ? t("paperDetail", base) : t("paperDetailWithReason", { ...base, reason: reasonLabel(entry.reason, t) });
}
