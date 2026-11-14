import { PAPER_DEFAULT_TIME_MS, PAPER_TIME_CONTROLS_MS, type GameVariant } from "@gomoku/core";

import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TranslatorOf } from "@/i18n/client";

/** What the creator of a game picks: the variant and, for the paper game, the clock of each player (E11, BR-46). */
export type GameSettingsChoice = { variant: GameVariant; timeControlMs: number };

export type HomeTranslator = TranslatorOf<"home">;

/** Polish, from the bundle: the default of every helper below, so callers not yet migrated keep their texts. */
export const PL_HOME: HomeTranslator = textsOf<"home">(plHome);

/** The classic game's clock per player. */
const CLASSIC_TIME_MS = 600_000;

export const DEFAULT_SETTINGS: GameSettingsChoice = { variant: "classic", timeControlMs: PAPER_DEFAULT_TIME_MS };

const VARIANTS: readonly GameVariant[] = ["classic", "paper"];

const minutesOf = (ms: number) => ms / 60_000;

/** The name of a variant: "Klasyczny", "Papier i ołówek". */
export const variantName = (variant: GameVariant, t: HomeTranslator = PL_HOME): string => t(`settings.variants.${variant}`);

export const VARIANT_NAME: Record<GameVariant, string> = { classic: variantName("classic"), paper: variantName("paper") };

export const variantOptions = (t: HomeTranslator = PL_HOME) => VARIANTS.map((value) => ({ value, label: variantName(value, t) }));
export const timeOptions = (t: HomeTranslator = PL_HOME) =>
  PAPER_TIME_CONTROLS_MS.map((ms) => ({ value: String(ms), label: t("settings.minutes", { minutes: t.number(minutesOf(ms)) }) }));

export const VARIANT_OPTIONS = variantOptions();
export const TIME_OPTIONS = timeOptions();

const isVariant = (value: string): value is GameVariant => (VARIANTS as readonly string[]).includes(value);
export const variantOf = (value: string): GameVariant => (isVariant(value) ? value : "classic");

/**
 * The settings part of the body of `POST /api/games` and `PUT /api/lobby/seeking`: nothing for the
 * classic game (the server's default, so the old requests stay as they were), both fields for the paper one.
 */
export function settingsBody({ variant, timeControlMs }: GameSettingsChoice): { variant?: GameVariant; timeControlMs?: number } {
  return variant === "paper" ? { variant, timeControlMs } : {};
}

/** One line naming what is played: "Papier i ołówek · 3 min", "Klasyczny · 10 min" (lobby list, history). */
export function settingsLabel(variant: GameVariant, timeControlMs: number, t: HomeTranslator = PL_HOME): string {
  return t("settings.line", { variant: variantName(variant, t), minutes: t.number(minutesOf(timeControlMs)) });
}

/** The rules line of an invitation: the classic text stays as it was, the paper game names its variant and clock. */
export function rulesLabel(variant: GameVariant, timeControlMs: number, t: HomeTranslator = PL_HOME): string {
  return variant === "paper"
    ? t("settings.paperRules", { settings: settingsLabel(variant, timeControlMs, t) })
    : t("settings.classicRules", { count: minutesOf(timeControlMs) });
}

/** The rules line under the variant choice on the home page: the classic text as it was, the paper game's approved sentence. */
export function homeRulesLabel(variant: GameVariant, t: HomeTranslator = PL_HOME): string {
  return variant === "paper" ? t("settings.paperHome") : rulesLabel("classic", CLASSIC_TIME_MS, t);
}
