import { NotFoundError, gameIdSchema } from "@gomoku/core";

import { GAME_NOT_FOUND_MESSAGE } from "../services/games/game-service";

/** The id of a show from its URL; anything that is not a game id is the 404 of a missing show. */
export function showIdOf(id: string): string {
  const parsed = gameIdSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
  return parsed.data;
}
