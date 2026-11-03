import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { refreshGuestCookie } from "@/server/http/guest-cookie";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * The creator closes the audience of a public game (E10-S05, BR-43): spectators are turned away
 * on their next read, the code opens neither watching nor review, the game goes on as private. No
 * body. Order: CSRF (403), participant (404), then the service: `200` with the state (also for a
 * repeat), `404` for anybody but the creator, `409` `GAME_NOT_ACTIVE` / `GAME_NOT_PUBLIC`.
 */
const closeAudience = apiHandler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => {
    const data = await cradle.gameService.closeAudience(participant, gameId);
    if (data.you.kind === "guest") await refreshGuestCookie(cradle.serverConfig);
    return { data };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return closeAudience(request, context);
}
