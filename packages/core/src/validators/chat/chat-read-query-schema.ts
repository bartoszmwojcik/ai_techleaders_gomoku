import { z } from "zod";

import { CHAT_MAX_PAGE_SIZE, CHAT_PAGE_SIZE } from "../../chat/constants";

/** Largest number of the `integer` column behind a message number: a cursor beyond it is a `400`, not a `500`. */
const MAX_CURSOR = 2_147_483_647;

/**
 * Query of `GET /api/games/{id}/chat`: `after_id` is the number of the last message the client has
 * (absent: the latest `limit`); `limit` is 1..`CHAT_MAX_PAGE_SIZE`, default `CHAT_PAGE_SIZE`.
 */
export const chatReadQuerySchema = z.object({
  after_id: z
    .string()
    .regex(/^\d{1,10}$/, { error: "Nieprawidłowy parametr after_id." })
    .transform(Number)
    .pipe(z.number().max(MAX_CURSOR, { error: "Nieprawidłowy parametr after_id." }))
    .optional(),
  limit: z
    .string()
    .regex(/^\d{1,3}$/, { error: "Nieprawidłowy parametr limit." })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(1, { error: "Nieprawidłowy parametr limit." })
        .max(CHAT_MAX_PAGE_SIZE, { error: "Nieprawidłowy parametr limit." }),
    )
    .default(CHAT_PAGE_SIZE),
});

export type ChatReadQuery = z.infer<typeof chatReadQuerySchema>;
