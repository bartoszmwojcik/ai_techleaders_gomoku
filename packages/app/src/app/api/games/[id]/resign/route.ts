import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { refreshGuestCookie } from "@/server/http/guest-cookie";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * Resigns the game for the caller (resignation spec). No body; the seat comes from the
 * session or the guest token. Order: CSRF (403), participant (404), then the service: `200`
 * with the state (also for a repeat by the player who resigned), `409` `GAME_FINISHED` /
 * `GAME_NOT_ACTIVE`.
 */
const resignGame = apiHandler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => {
    const data = await cradle.gameMoveService.resign(participant, gameId);
    if (data.you.kind === "guest") await refreshGuestCookie(cradle.serverConfig);
    return { data };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return resignGame(request, context);
}
