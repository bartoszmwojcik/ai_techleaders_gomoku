import { NotFoundError, gameIdSchema } from "@gomoku/core";

import { withRequestScope } from "../container";
import {
  GAME_NOT_FOUND_MESSAGE,
  type GameParticipant,
} from "../services/games/game-service";
import { getCurrentUser } from "./auth";
import { readGuestTokenHash } from "./guest-cookie";

/**
 * The game id from a URL; a malformed one is "no such game" (`404`), never a database error.
 * @throws AppError 404
 */
export function parseGameId(id: string): string {
  const parsed = gameIdSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
  return parsed.data;
}

/**
 * Guard of every game route (#21): who is asking, as a participant of `gameId`. The
 * signed-in account first, then the guest token cookie (BR-22). Anybody who does not play
 * in the game - and a game that does not exist - gets the same `404`, so the answer does not
 * confirm that a game exists. This is the contract of #22-#24.
 * @throws AppError 404
 */
export async function resolveParticipant(
  gameId: string,
): Promise<{ gameId: string; participant: GameParticipant }> {
  const id = parseGameId(gameId);
  const user = await getCurrentUser();
  const participant = await withRequestScope(async ({ cradle }) =>
    cradle.gameService.findParticipant(
      {
        userId: user?.id,
        guestTokenHash: await readGuestTokenHash(cradle.serverConfig),
      },
      id,
    ),
  );
  if (!participant) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
  return { gameId: id, participant };
}
