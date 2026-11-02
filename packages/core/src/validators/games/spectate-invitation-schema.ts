import { z } from "zod";

import { nicknameSchema } from "../../games/nickname";

/**
 * Input of `POST /api/invitations/{code}/spectate` (E10-S02, BR-41): a visitor without an account
 * may give a nickname of 1-24 characters (the rules of a guest's, E02-S07); empty means none. An
 * account is named by the account, so the service refuses a nickname next to a session.
 */
export const spectateInvitationSchema = z.object({
  nickname: nicknameSchema.optional(),
});

export type SpectateInvitationInput = z.infer<typeof spectateInvitationSchema>;
