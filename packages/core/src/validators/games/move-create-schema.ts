import { z } from "zod";

import { BOARD_CELLS } from "../../games/board";
import { PAPER_BOARD_SIZE, PAPER_CELLS } from "../../games/paper/constants";
import { BOARD_SIZE } from "../../games/rules";

const coordinate = (message: string, size: number) =>
  z.number({ error: message }).int({ error: message }).min(0, { error: message }).max(size - 1, { error: message });

/**
 * The classic game's bounds (0–14, 225 moves) of the same input; `GameMoveService` applies it to a
 * classic game so a move outside 15×15 is refused exactly as before E11.
 * Input of `POST /api/games/{id}/moves` (#22 Q4): the cell and the number of the move the
 * client wants to make (`moveCount + 1` of the state it saw). The seat and the colour never
 * come from the client. Shared by the client and the server.
 */
export const classicMoveCreateSchema = z.object({
  x: coordinate("Nieprawidłowa kolumna.", BOARD_SIZE),
  y: coordinate("Nieprawidłowy rząd.", BOARD_SIZE),
  moveNumber: z
    .number({ error: "Nieprawidłowy numer ruchu." })
    .int({ error: "Nieprawidłowy numer ruchu." })
    .min(1, { error: "Nieprawidłowy numer ruchu." })
    .max(BOARD_CELLS, { error: "Nieprawidłowy numer ruchu." }),
});

/**
 * Input of `POST /api/games/{id}/moves` (#22 Q4): the cell and the number of the move the
 * client wants to make (`moveCount + 1` of the state it saw). The seat and the colour never
 * come from the client. Shared by the client and the server. The bounds are those of the widest sheet (the paper game, 101×101,
 * E11); the variant's own bounds are applied by the move service.
 */
export const moveCreateSchema = z.object({
  x: coordinate("Nieprawidłowa kolumna.", PAPER_BOARD_SIZE),
  y: coordinate("Nieprawidłowy rząd.", PAPER_BOARD_SIZE),
  moveNumber: z
    .number({ error: "Nieprawidłowy numer ruchu." })
    .int({ error: "Nieprawidłowy numer ruchu." })
    .min(1, { error: "Nieprawidłowy numer ruchu." })
    .max(PAPER_CELLS, { error: "Nieprawidłowy numer ruchu." }),
});

export type MoveCreateInput = z.infer<typeof moveCreateSchema>;
