import { z } from "zod";

import { BOARD_CELLS } from "../../games/board";

/**
 * Query of `GET /api/games/{id}` (#22 Q5): `after` is the number of moves the client already
 * knows (default 0). Upper bound against the game's `moveCount` is checked by the service.
 */
export const gameStateQuerySchema = z.object({
  after: z
    .string()
    .regex(/^\d{1,3}$/, { error: "Nieprawidłowy parametr after." })
    .transform(Number)
    .pipe(z.number().max(BOARD_CELLS, { error: "Nieprawidłowy parametr after." }))
    .default(0),
});

export type GameStateQuery = z.infer<typeof gameStateQuerySchema>;
