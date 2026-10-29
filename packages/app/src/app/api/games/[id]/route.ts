import { gameStateQuerySchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { refreshGuestCookie } from "@/server/http/guest-cookie";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * State of a game for its participant (#21): status, seats, who already opened the page and,
 * for the creator of a waiting game, the invitation. Since #22 also the board: `moveCount`,
 * `blackSeat`, `turnSeat`, `result`, and the `moves` after the first `?after=` ones (default
 * all). Everyone else gets `404`; an `after` outside the game is `400`.
 */
const getGame = apiHandler(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const { after } = gameStateQuerySchema.parse({
    after: new URL(request.url).searchParams.get("after") ?? undefined,
  });
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => {
    const data = await cradle.gameService.getState(participant, gameId, after);
    // Sliding cookie (#21 Q10): until #23 a game may outlast the cookie's two hours. The
    // server still decides the token's validity; accounts have no guest cookie to refresh.
    if (data.you.kind === "guest") await refreshGuestCookie(cradle.serverConfig);
    return { data };
  });
});

export async function GET(request: Request, context: Context) {
  await connection();
  return getGame(request, context);
}
