import { gameStateQuerySchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { requireAdminApi } from "@/server/http/admin-gate";
import { apiHandler } from "@/server/http/api-handler";
import { showIdOf } from "@/server/http/show-id";
import { toShowView } from "@/server/http/show-view";

type Context = { params: Promise<{ id: string }> };

/**
 * The state of a show for the administrator (show-mode, "API Contracts"): `?after=` as in a player's read. A game
 * that is not a show, a bad id and anybody but the administrator are all the same `404`.
 */
const getShow = apiHandler(
  async (request: Request, { params }: Context) => {
    const gameId = showIdOf((await params).id);
    const { after } = gameStateQuerySchema.parse({ after: new URL(request.url).searchParams.get("after") ?? undefined });
    return withRequestScope(async ({ cradle }) => ({ data: toShowView(await cradle.showService.read(gameId, after)) }));
  },
  { gate: requireAdminApi },
);

export async function GET(request: Request, context: Context) {
  await connection();
  return getShow(request, context);
}
