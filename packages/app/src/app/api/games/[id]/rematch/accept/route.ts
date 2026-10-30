import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { readGuestToken, setGuestCookie } from "@/server/http/guest-cookie";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * Accepts the opponent's rematch offer (rematch spec): creates the new game with swapped
 * colours and answers `{ gameId }` to redirect to. A guest gets the token of the new game in
 * the cookie (never in the JSON). `409` `REMATCH_NOT_OFFERED` / `REMATCH_EXPIRED` /
 * `REMATCH_UNAVAILABLE` / `ACTIVE_GAME_EXISTS` (`data.gameId` = the caller's own other game).
 */
const acceptRematch = apiHandler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => {
    const token = await readGuestToken(cradle.serverConfig);
    const { guestToken, ...data } = await cradle.rematchService.accept(participant, gameId, token);
    if (guestToken) await setGuestCookie(cradle.serverConfig, guestToken);
    return { data };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return acceptRematch(request, context);
}
