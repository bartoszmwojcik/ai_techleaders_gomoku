import { z } from "zod";

import { BOARD_CELLS } from "../../games/board";
import { PAPER_CELLS } from "../../games/paper/constants";

/**
 * Query of `GET /api/games/{id}` (#22 Q5): `after` is the number of moves the client already
 * knows (default 0). Upper bound against the game's `moveCount` is checked by the service.
 */
export const classicGameStateQuerySchema = z.object({
  after: z
    .string()
    .regex(/^\d{1,3}$/, { error: "Nieprawidłowy parametr after." })
    .transform(Number)
    .pipe(z.number().max(BOARD_CELLS, { error: "Nieprawidłowy parametr after." }))
    .default(0),
});

/**
 * Query of `GET /api/games/{id}` (#22 Q5): `after` is the number of moves the client already
 * knows (default 0). The bound is the widest game (the paper game, E11); a classic game applies
 * `classicGameStateQuerySchema`. Upper bound against the game's `moveCount` is checked by the service.
 */
export const gameStateQuerySchema = z.object({
  after: z
    .string()
    .regex(/^\d{1,5}$/, { error: "Nieprawidłowy parametr after." })
    .transform(Number)
    .pipe(z.number().max(PAPER_CELLS, { error: "Nieprawidłowy parametr after." }))
    .default(0),
});

export type GameStateQuery = z.infer<typeof gameStateQuerySchema>;
