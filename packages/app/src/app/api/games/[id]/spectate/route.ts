import { gameStateQuerySchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { refreshSpectatorCookie } from "@/server/http/spectator-cookie";
import { resolveSpectator } from "@/server/http/spectator";

type Context = { params: Promise<{ id: string }> };

/**
 * State of a game for its spectator (E10-S02): status, the seats with their names, the board
 * (`moves` after the first `?after=` ones, `blackSeat`, `turnSeat`, `moveCount`, `result`) and both clocks
 * (`clock.now` is the server's time). A subset of `GET /api/games/[id]`: no `you`, no invitation, no
 * rematch, no chat. Everyone who does not watch the game gets `404`; an `after` outside the game is `400`.
 * The answer is never cached.
 */
const readState = apiHandler(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const { after } = gameStateQuerySchema.parse({
    after: new URL(request.url).searchParams.get("after") ?? undefined,
  });
  const { gameId, spectator } = await resolveSpectator(id);
  return withRequestScope(async ({ cradle }) => {
    const data = await cradle.spectatorService.getState(spectator, gameId, after);
    // Sliding cookie, like the access it carries; an account has no cookie to refresh.
    await refreshSpectatorCookie(cradle.serverConfig);
    return { data };
  });
});

export async function GET(request: Request, context: Context) {
  await connection();
  const response = await readState(request, context);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
