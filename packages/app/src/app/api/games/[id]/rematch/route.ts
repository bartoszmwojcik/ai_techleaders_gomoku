import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { refreshGuestCookie } from "@/server/http/guest-cookie";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * Offers a rematch of a finished game (rematch spec). Either participant, account or guest;
 * the body is empty. Order: CSRF (403), participant (404), then the service: `200` with the
 * offer, `409` `GAME_NOT_FINISHED` / `REMATCH_ALREADY_OFFERED`, `429` `RATE_LIMITED`.
 */
const offerRematch = apiHandler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => {
    const data = await cradle.rematchService.offer(participant, gameId);
    // The guest cookie slides while the guest is still playing (#21 Q10).
    await refreshGuestCookie(cradle.serverConfig);
    return { data };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return offerRematch(request, context);
}
