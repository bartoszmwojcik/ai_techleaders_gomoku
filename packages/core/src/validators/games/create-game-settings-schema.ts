import { z } from "zod";

import {
  DEFAULT_VARIANT,
  GAME_VARIANTS,
  PAPER_DEFAULT_TIME_MS,
  PAPER_TIME_CONTROLS_MS,
  type GameVariant,
} from "../../games/paper/constants";
import { INITIAL_CLOCK_MS } from "../../games/constants";

export const TIME_CONTROL_WITH_CLASSIC_MESSAGE = "Czas partii można wybrać tylko w wariancie „papier i ołówek”.";

/**
 * Fields choosing the game variant (E11, BR-46), shared by the account, guest and lobby inputs.
 * Both are optional: no variant is the classic game, a missing time in the paper game is
 * three minutes.
 */
export const gameSettingsShape = {
  variant: z.enum(GAME_VARIANTS, { error: "Nieprawidłowy wariant partii." }).optional(),
  timeControlMs: z
    .union(
      PAPER_TIME_CONTROLS_MS.map((value) => z.literal(value)) as [
        z.ZodLiteral<60_000>,
        z.ZodLiteral<120_000>,
        z.ZodLiteral<180_000>,
        z.ZodLiteral<300_000>,
      ],
      { error: "Nieprawidłowy czas partii." },
    )
    .optional(),
};

type SettingsInput = { variant?: GameVariant | undefined; timeControlMs?: number | undefined };

/** A time only makes sense for the paper game; for the classic one it is a validation error. */
export function checkGameSettings(input: SettingsInput, ctx: z.RefinementCtx): void {
  if ((input.variant ?? DEFAULT_VARIANT) === "classic" && input.timeControlMs !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["timeControlMs"],
      message: TIME_CONTROL_WITH_CLASSIC_MESSAGE,
      params: { code: "TIME_CONTROL_CLASSIC" },
    });
  }
}

/** The settings of a game as stored: the variant and the clock budget of each player. */
export type GameSettings = { variant: GameVariant; timeControlMs: number };

/** Fills the defaults of an (already validated) input. */
export function resolveGameSettings(input: SettingsInput = {}): GameSettings {
  const variant = input.variant ?? DEFAULT_VARIANT;
  return {
    variant,
    timeControlMs: variant === "paper" ? (input.timeControlMs ?? PAPER_DEFAULT_TIME_MS) : INITIAL_CLOCK_MS,
  };
}

/** Input of `POST /api/lobby/seeking` and the settings part of the game-creating inputs. */
export const createGameSettingsSchema = z.object(gameSettingsShape).superRefine(checkGameSettings);

export type CreateGameSettingsInput = z.infer<typeof createGameSettingsSchema>;
