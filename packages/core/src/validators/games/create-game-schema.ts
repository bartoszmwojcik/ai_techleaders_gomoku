import { z } from "zod";

import { nicknameSchema } from "../../games/nickname";

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
    nickname: nicknameSchema.optional(),
  })
  .refine((input) => input.acknowledgedGuestWarning === true, {
    path: ["acknowledgedGuestWarning"],
    error: GUEST_WARNING_REQUIRED_MESSAGE,
  });

export type CreateGuestGameInput = z.infer<typeof createGuestGameSchema>;
