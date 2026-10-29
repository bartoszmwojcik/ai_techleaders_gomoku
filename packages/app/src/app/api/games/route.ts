import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";

/**
 * Creates a waiting game with a one-use invitation (#21). Needs a session (a guest has
 * none, so `401`); the 10-per-hour limit, BR-13 (`409 ACTIVE_GAME_EXISTS`) and the lazy
 * closing of stale games are the service's job.
 */
const createGame = apiHandler(async () => {
  const user = await requireSession();
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.gameService.create(user.id),
    status: 201,
  }));
});

export async function POST(request: Request) {
  await connection();
  return createGame(request);
}
