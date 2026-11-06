import { z } from "zod";

import type { BotLevel } from "../../bot/choose-move";
import { DEFAULT_VARIANT, type GameVariant } from "../../games/paper/constants";

/** Who the creator plays against: a person they invite, or the bot hosted by us (spec 2026-11-05-hosted-bot). */
export const OPPONENTS = ["human", "bot"] as const;
export type Opponent = (typeof OPPONENTS)[number];

export const BOT_LEVEL_REQUIRED_MESSAGE = "Wybierz poziom bota.";
export const BOT_LEVEL_WITHOUT_BOT_MESSAGE = "Poziom bota wybiera się tylko w partii z botem.";
export const BOT_VARIANT_UNSUPPORTED_MESSAGE = "Bot gra tylko w wariancie klasycznym.";
export const BOT_PUBLIC_MESSAGE = "Partia z botem nie może być publiczna.";

/** Fields choosing the opponent of a new game, shared by the account and guest inputs of `POST /api/games`. */
export const opponentShape = {
  opponent: z.enum(OPPONENTS, { error: "Nieprawidłowy przeciwnik." }).optional(),
  botLevel: z.union([z.literal(1), z.literal(2)], { error: "Nieprawidłowy poziom bota." }).optional(),
};

type OpponentInput = {
  opponent?: Opponent | undefined;
  botLevel?: BotLevel | undefined;
  variant?: GameVariant | undefined;
  isPublic?: boolean | undefined;
};

/**
 * The bot plays only the classic, private game (BR-56, R14), and only the bot has a level. A time
 * with the classic variant is refused by `checkGameSettings` already, so a bot game cannot carry one.
 */
export function checkOpponent(input: OpponentInput, ctx: z.RefinementCtx): void {
  if (input.opponent !== "bot") {
    if (input.botLevel !== undefined) ctx.addIssue({ code: "custom", path: ["botLevel"], message: BOT_LEVEL_WITHOUT_BOT_MESSAGE });
    return;
  }
  if (input.botLevel === undefined) ctx.addIssue({ code: "custom", path: ["botLevel"], message: BOT_LEVEL_REQUIRED_MESSAGE });
  if ((input.variant ?? DEFAULT_VARIANT) !== "classic") {
    ctx.addIssue({ code: "custom", path: ["opponent"], message: BOT_VARIANT_UNSUPPORTED_MESSAGE });
  }
  if (input.isPublic === true) ctx.addIssue({ code: "custom", path: ["isPublic"], message: BOT_PUBLIC_MESSAGE });
}

/** The opponent of an (already validated) input: `{ kind: 'bot', level }` or a person. */
export type OpponentChoice = { kind: "human" } | { kind: "bot"; level: BotLevel };

export function resolveOpponent(input: { opponent?: Opponent | undefined; botLevel?: BotLevel | undefined }): OpponentChoice {
  return input.opponent === "bot" ? { kind: "bot", level: input.botLevel ?? 1 } : { kind: "human" };
}
