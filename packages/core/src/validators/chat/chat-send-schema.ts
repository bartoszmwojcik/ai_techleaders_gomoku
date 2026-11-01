import { z } from "zod";

import { CHAT_RAW_MAX_UNITS } from "../../chat/constants";

/**
 * Input of `POST /api/games/{id}/chat`: the raw text (at most `CHAT_RAW_MAX_UNITS` UTF-16 units
 * before NFKC, so normalization stays cheap) and the id of this attempt. Unknown fields are refused.
 * The text is judged by `normalizeChatMessage`; the messages here never repeat the input.
 */
export const chatSendSchema = z.strictObject({
  text: z
    .string({ error: "Wiadomość musi być tekstem." })
    .max(CHAT_RAW_MAX_UNITS, { error: "Wiadomość jest za długa." }),
  clientId: z.uuid({ error: "Nieprawidłowy identyfikator wiadomości." }),
});

export type ChatSendInput = z.infer<typeof chatSendSchema>;
