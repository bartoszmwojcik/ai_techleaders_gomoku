import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * State of a game for its participant (#21): status, seats, who already opened the page and,
 * for the creator of a waiting game, the invitation. Everyone else gets `404`.
 */
const getGame = apiHandler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.gameService.getState(participant, gameId),
  }));
});

export async function GET(request: Request, context: Context) {
  await connection();
  return getGame(request, context);
}
