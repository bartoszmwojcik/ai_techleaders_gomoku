import type { BotLevel } from "@gomoku/core/bot/choose-move";
import { BOT_LEVELS, BOT_UNAVAILABLE_MESSAGE } from "@gomoku/core/bot/profile";
import { defaultNickname } from "@gomoku/core/games/nickname";
import type { GameVariant } from "@gomoku/core/games/paper/constants";
import type { Seat } from "@gomoku/core/games/types";
import type { Opponent } from "@gomoku/core/validators/games/opponent-schema";

import { PL_HOME, type HomeTranslator } from "./settings";

/** Who the creator wants to play against (hosted-bot spec, UI/UX): a person by invitation, or the bot with a level. */
export type OpponentSetting = { opponent: Opponent; botLevel: BotLevel };

export const DEFAULT_OPPONENT: OpponentSetting = { opponent: "human", botLevel: 1 };

export const opponentOptions = (t: HomeTranslator = PL_HOME) =>
  [
    { value: "human", label: t("opponent.human") },
    { value: "bot", label: t("opponent.bot") },
  ] as const;

/** One chip per level (BR-55): the choice is shown whenever there is more than one. */
export const botLevelOptions = (t: HomeTranslator = PL_HOME) =>
  BOT_LEVELS.map((level) => ({ value: String(level), label: t("opponent.level", { level }) }));

export const OPPONENT_OPTIONS = opponentOptions();
export const BOT_LEVEL_OPTIONS = botLevelOptions();

export const BOT_CLASSIC_ONLY_TEXT = PL_HOME("opponent.classicOnly");
/** The same text as the server's `503 BOT_UNAVAILABLE` (one constant in `core`); a translated screen reads `shared.botUnavailable`. */
export const BOT_UNAVAILABLE_TEXT = BOT_UNAVAILABLE_MESSAGE;

/** The bot plays only the classic game (BR-56): picking the paper game puts a person back as the opponent. */
export function playsBot(setting: OpponentSetting, variant: GameVariant): boolean {
  return setting.opponent === "bot" && variant === "classic";
}

/** The opponent part of the body of `POST /api/games`: nothing for a person (the server's default). */
export function opponentBody(setting: OpponentSetting, variant: GameVariant): { opponent?: "bot"; botLevel?: BotLevel } {
  return playsBot(setting, variant) ? { opponent: "bot", botLevel: setting.botLevel } : {};
}

export const opponentOf = (value: string): Opponent => (value === "bot" ? "bot" : "human");
export const botLevelOf = (value: string): BotLevel => (value === "2" ? 2 : 1);

/**
 * The nickname a guest takes into "Zagraj ponownie z botem": their own one, not the default name
 * derived from the seat (which the new game derives again). Nothing for an account.
 */
export function guestNickname(kind: string, displayName: string | null | undefined, seat: Seat): string | undefined {
  if (kind !== "guest" || !displayName || displayName === defaultNickname(seat)) return undefined;
  return displayName;
}
