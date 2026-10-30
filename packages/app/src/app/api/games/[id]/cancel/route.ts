import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * Cancels the caller's waiting game (#21 Q5): the creator, an account or a guest browser
 * (E02-S08), is resolved like on every game route. `404` for anybody else, `409
 * GAME_NOT_CANCELLABLE` once the game is not waiting any more.
 */
const cancelGame = apiHandler(async (_request: Request, { params }: Context) => {
  const { gameId, participant } = await resolveParticipant((await params).id);
  return withRequestScope(async ({ cradle }) => {
    await cradle.gameService.cancel(participant, gameId);
    return { data: null };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return cancelGame(request, context);
}
