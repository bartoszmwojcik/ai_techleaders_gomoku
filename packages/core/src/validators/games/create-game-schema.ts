import { z } from "zod";

import { nicknameSchema } from "../../games/nickname";
import { checkGameSettings, gameSettingsShape } from "./create-game-settings-schema";
import { checkOpponent, opponentShape } from "./opponent-schema";

export const GUEST_WARNING_REQUIRED_MESSAGE = "Potwierdź, że rozumiesz ograniczenia gry bez konta.";

/**
 * Input of `POST /api/games` for a visitor without an account (E02-S08). The warning must be
 * acknowledged on the server, not only in the UI; an empty nickname means "none" (the default
 * name applies). A signed-in user sends no body, so this schema is not applied to them.
 */
export const createGuestGameSchema = z
  .object({
    acknowledgedGuestWarning: z.boolean().optional(),
    cancelOwnWaitingGame: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    nickname: nicknameSchema.optional(),
    ...gameSettingsShape,
    ...opponentShape,
  })
  .superRefine(checkGameSettings)
  .superRefine(checkOpponent)
  .refine((input) => input.acknowledgedGuestWarning === true, {
    path: ["acknowledgedGuestWarning"],
    error: GUEST_WARNING_REQUIRED_MESSAGE,
  });

export type CreateGuestGameInput = z.infer<typeof createGuestGameSchema>;

/**
 * Optional body of `POST /api/games` for a signed-in user (E10-S01): an absent body means a
 * private game. Unknown keys are ignored, as before the body existed.
 */
export const createAccountGameSchema = z
  .object({ isPublic: z.boolean().optional(), ...gameSettingsShape, ...opponentShape })
  .superRefine(checkGameSettings)
  .superRefine(checkOpponent);

export type CreateAccountGameInput = z.infer<typeof createAccountGameSchema>;
