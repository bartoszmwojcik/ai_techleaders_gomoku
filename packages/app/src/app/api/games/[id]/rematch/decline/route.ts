import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { refreshGuestCookie } from "@/server/http/guest-cookie";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * Declines the open rematch offer, or withdraws one's own (rematch spec Q3); also what leaving
 * to the panel does. Repeating it is fine. `409` `REMATCH_NOT_OFFERED` / `REMATCH_EXPIRED`.
 */
const declineRematch = apiHandler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => {
    await cradle.rematchService.decline(participant, gameId);
    await refreshGuestCookie(cradle.serverConfig);
    return { data: null };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return declineRematch(request, context);
}
