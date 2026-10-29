import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";
import { parseGameId } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * Cancels the signed-in user's waiting game (#21 Q5). Only the creator may; `404` for
 * anybody else, `409 GAME_NOT_CANCELLABLE` once the game is not waiting any more.
 */
const cancelGame = apiHandler(async (_request: Request, { params }: Context) => {
  const user = await requireSession();
  const gameId = parseGameId((await params).id);
  return withRequestScope(async ({ cradle }) => {
    await cradle.gameService.cancel(user.id, gameId);
    return { data: null };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return cancelGame(request, context);
}
