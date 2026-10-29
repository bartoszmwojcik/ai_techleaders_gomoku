import { z } from "zod";

import { BOARD_CELLS } from "../../games/board";
import { BOARD_SIZE } from "../../games/rules";

const coordinate = (message: string) =>
  z.number({ error: message }).int({ error: message }).min(0, { error: message }).max(BOARD_SIZE - 1, { error: message });

/**
 * Input of `POST /api/games/{id}/moves` (#22 Q4): the cell and the number of the move the
 * client wants to make (`moveCount + 1` of the state it saw). The seat and the colour never
 * come from the client. Shared by the client and the server.
 */
export const moveCreateSchema = z.object({
  x: coordinate("Nieprawidłowa kolumna."),
  y: coordinate("Nieprawidłowy rząd."),
  moveNumber: z
    .number({ error: "Nieprawidłowy numer ruchu." })
    .int({ error: "Nieprawidłowy numer ruchu." })
    .min(1, { error: "Nieprawidłowy numer ruchu." })
    .max(BOARD_CELLS, { error: "Nieprawidłowy numer ruchu." }),
});

export type MoveCreateInput = z.infer<typeof moveCreateSchema>;
