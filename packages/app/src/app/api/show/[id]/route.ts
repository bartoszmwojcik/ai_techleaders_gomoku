import { gameStateQuerySchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { requireAdminApi } from "@/server/http/admin-gate";
import { apiHandler } from "@/server/http/api-handler";
import { scheduleBotTurn } from "@/server/http/bot-turn";
import { showIdOf } from "@/server/http/show-id";
import { toShowView } from "@/server/http/show-view";

type Context = { params: Promise<{ id: string }> };

/**
 * The state of a show for the administrator (show-mode, "API Contracts"): `?after=` as in a player's read. A game
 * that is not a show, a bad id and anybody but the administrator are all the same `404`. This read is the show's
 * drive (show-mode, "Driver"): while a bot is on turn it schedules the bot's move after the answer, and the bot
 * plays once its pause is over, so the view's polling makes the bots play one after the other.
 */
const getShow = apiHandler(
  async (request: Request, { params }: Context) => {
    const gameId = showIdOf((await params).id);
    const { after } = gameStateQuerySchema.parse({ after: new URL(request.url).searchParams.get("after") ?? undefined });
    const state = await withRequestScope(({ cradle }) => cradle.showService.read(gameId, after));
    if (state.drive.botOnTurn) scheduleBotTurn(gameId);
    return { data: toShowView(state) };
  },
  { gate: requireAdminApi },
);

export async function GET(request: Request, context: Context) {
  await connection();
  return getShow(request, context);
}
