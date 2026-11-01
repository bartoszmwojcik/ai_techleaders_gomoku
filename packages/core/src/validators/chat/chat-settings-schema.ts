import { z } from "zod";

/**
 * Input of `PUT /api/games/{id}/chat/settings`: whether the chat is on for the asking participant.
 * Anything but a boolean, a missing field or an extra field is refused; the messages never repeat the input.
 */
export const chatSettingsSchema = z.strictObject({
  enabled: z.boolean({ error: "Ustawienie czatu musi być wartością logiczną." }),
});

export type ChatSettingsInput = z.infer<typeof chatSettingsSchema>;
