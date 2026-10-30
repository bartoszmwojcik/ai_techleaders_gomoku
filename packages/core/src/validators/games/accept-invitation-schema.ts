import { z } from "zod";

import { nicknameSchema } from "../../games/nickname";

/**
 * Input of `POST /api/invitations/{code}/accept` (#21). Joining as a guest requires the
 * warning to be acknowledged on the server, not only in the UI (Q11).
 */
export const acceptInvitationSchema = z
  .object({
    as: z.enum(["user", "guest"], { error: "Wybierz, jak dołączasz do partii." }),
    acknowledgedGuestWarning: z.boolean().optional(),
    cancelOwnWaitingGame: z.boolean().optional(),
    // Only a guest picks a nickname (E02-S07); empty after normalization means "none".
    nickname: nicknameSchema.optional(),
  })
  .refine((input) => input.as !== "user" || input.nickname === undefined, {
    path: ["nickname"],
    error: "Nick podaje tylko gość.",
  })
  .refine((input) => input.as !== "guest" || input.acknowledgedGuestWarning === true, {
    path: ["acknowledgedGuestWarning"],
    error: "Potwierdź, że rozumiesz ograniczenia gry bez konta.",
  });

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
