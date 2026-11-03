import { NotFoundError } from "@gomoku/core";

import { withRequestScope } from "../container";
import { GAME_NOT_FOUND_MESSAGE } from "../services/games/game-service";
import type { SpectatorAccess } from "../services/games/spectator-service";
import { getCurrentUser } from "./auth";
import { parseGameId } from "./participant";
import { readSpectatorTokenHash } from "./spectator-cookie";

/**
 * Guard of the spectator routes (E10-S02): who is asking, as a spectator of `gameId`. The signed-in
 * account first, then the spectator cookie. Anybody who does not watch the game - and a game that
 * does not exist - gets the same `404`. This guard knows no participant, and
 * `resolveParticipant` knows no spectator: a spectator reaching a player's route is a stranger.
 * @throws AppError 404
 */
export async function resolveSpectator(
  gameId: string,
): Promise<{ gameId: string; spectator: SpectatorAccess }> {
  const id = parseGameId(gameId);
  const user = await getCurrentUser();
  const spectator = await withRequestScope(async ({ cradle }) =>
    cradle.spectatorService.find(
      { userId: user?.id, tokenHash: await readSpectatorTokenHash(cradle.serverConfig) },
      id,
    ),
  );
  if (!spectator) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
  return { gameId: id, spectator };
}
