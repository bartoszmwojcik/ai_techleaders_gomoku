import { DEFAULT_LOCALE, type Locale } from "@gomoku/core/i18n/locales";
import { createTranslator, type Translator } from "@gomoku/core/i18n/translator";
import type { ApiErrorBody } from "@gomoku/core/http/api-result";

import plShow from "@/i18n/catalogs/pl/show";
import type { NamespaceDict } from "@/i18n/catalogs/types";
import type { ShowView } from "@/server/http/show-view";

export type ShowDict = NamespaceDict<"show">;
export type ShowTranslator = Translator<ShowDict>;

/** The texts of the show in the language the server picked; Polish (in the bundle) when it passed none. */
export function showTranslator(locale: Locale = DEFAULT_LOCALE, dict: ShowDict = plShow): ShowTranslator {
  return createTranslator(locale, dict);
}

type Player = ShowView["players"][number];

/**
 * The name of a seat (i18n I14): a bot from its strength (`Bot · niveau 2 · 16 Mo`), an agent as "Agent" with the
 * name it declared marked as such (BR-31). The server's `displayName` stays the fallback.
 */
export function seatName(t: ShowTranslator, player: Player): string {
  if (player.kind === "bot" && player.bot) {
    const { level, tableMb } = player.bot;
    return tableMb === null ? t("bot.name", { level }) : t("bot.nameWithTable", { level, table: t.megabytes(tableMb) });
  }
  if (player.kind === "agent") return player.agentName ? t("agent.declared", { name: player.agentName }) : t("agent.name");
  return player.displayName ?? "";
}

/** "Kolumna C, rząd 7, puste" for the board's screen reader labels. */
export function cellLabelOf(t: ShowTranslator) {
  return ({ column, row, state }: { column: string; row: number; state: "empty" | "black" | "white" }) =>
    t("board.cell", { column, row, state: t(`board.${state}`) });
}

const SHOW_REASONS = ["disabled", "bot_vs_bot_disabled"] as const;
const BOT_REASONS = ["disabled", "memory", "busy", "level2_not_allowed"] as const;

const isOneOf = <T extends string>(list: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (list as readonly string[]).includes(value);

/** What the administrator reads for a refused request: by its code and, where the server names one, its reason. */
export function errorText(t: ShowTranslator, error: Pick<ApiErrorBody, "code" | "data">): string {
  const reason = typeof error.data?.reason === "string" ? error.data.reason : undefined;
  switch (error.code) {
    case "SHOW_RUNNING":
    case "RATE_LIMITED":
      return t(`errors.${error.code}`);
    case "SHOW_UNAVAILABLE":
      return t(`errors.SHOW_UNAVAILABLE.${isOneOf(SHOW_REASONS, reason) ? reason : "disabled"}`);
    case "BOT_UNAVAILABLE":
      return t(`errors.BOT_UNAVAILABLE.${isOneOf(BOT_REASONS, reason) ? reason : "other"}`);
    default:
      return t("errors.other");
  }
}

/** `?projektor=1` turns the projector view on, `?projektor=0` off; anything else leaves the choice to the browser. */
export function projectorParam(value: string | string[] | undefined): boolean | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === "1") return true;
  if (first === "0") return false;
  return null;
}

export const PROJECTOR_STORAGE_KEY = "gomoku.show.projector";

/** The last choice of this browser, only a default when the address says nothing; storage may be blocked. */
export function readStoredProjector(storage: () => Storage = () => window.localStorage): boolean {
  try {
    return storage().getItem(PROJECTOR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function storeProjector(on: boolean, storage: () => Storage = () => window.localStorage): void {
  try {
    storage().setItem(PROJECTOR_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Storage blocked (a private window, a policy): the address still carries the choice.
  }
}
