import { PAPER_DEFAULT_TIME_MS, PAPER_TIME_CONTROLS_MS, type GameVariant } from "@gomoku/core";

/** What the creator of a game picks: the variant and, for the paper game, the clock of each player (E11, BR-46). */
export type GameSettingsChoice = { variant: GameVariant; timeControlMs: number };

/** The classic game's clock per player. */
const CLASSIC_TIME_MS = 600_000;

export const DEFAULT_SETTINGS: GameSettingsChoice = { variant: "classic", timeControlMs: PAPER_DEFAULT_TIME_MS };

export const VARIANT_NAME: Record<GameVariant, string> = { classic: "Klasyczny", paper: "Papier i ołówek" };
export const VARIANT_OPTIONS = (Object.keys(VARIANT_NAME) as GameVariant[]).map((value) => ({ value, label: VARIANT_NAME[value] }));
export const TIME_OPTIONS = PAPER_TIME_CONTROLS_MS.map((ms) => ({ value: String(ms), label: `${ms / 60_000} min` }));

const isVariant = (value: string): value is GameVariant => value in VARIANT_NAME;
export const variantOf = (value: string): GameVariant => (isVariant(value) ? value : "classic");

/**
 * The settings part of the body of `POST /api/games` and `PUT /api/lobby/seeking`: nothing for the
 * classic game (the server's default, so the old requests stay as they were), both fields for the paper one.
 */
export function settingsBody({ variant, timeControlMs }: GameSettingsChoice): { variant?: GameVariant; timeControlMs?: number } {
  return variant === "paper" ? { variant, timeControlMs } : {};
}

/** One line naming what is played: "Papier i ołówek · 3 min", "Klasyczny · 10 min" (lobby list, history). */
export function settingsLabel(variant: GameVariant, timeControlMs: number): string {
  return `${VARIANT_NAME[variant]} · ${timeControlMs / 60_000} min`;
}

/** The rules line of an invitation: the classic text stays as it was, the paper game names its variant and clock. */
export function rulesLabel(variant: GameVariant, timeControlMs: number): string {
  return variant === "paper"
    ? `${settingsLabel(variant, timeControlMs)} na gracza`
    : `Swobodne zasady · plansza 15×15 · ${timeControlMs / 60_000} minut na gracza`;
}

/** The rules line under the variant choice on the home page: the classic text as it was, the paper game's approved sentence. */
export function homeRulesLabel(variant: GameVariant): string {
  return variant === "paper"
    ? "Kółko i krzyżyk na kartce papieru, 5 w linii, gra na czas."
    : rulesLabel("classic", CLASSIC_TIME_MS);
}
