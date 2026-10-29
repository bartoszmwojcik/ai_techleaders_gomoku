import { moveCreateSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { refreshGuestCookie } from "@/server/http/guest-cookie";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * Plays one move (#22). Body `{ x, y, moveNumber }`; the seat comes from the session or the
 * guest token, never from the body. Order: CSRF (403), input (400), participant (404), then
 * the service: `200` with the state (also for a retry of the same move), `409`
 * `GAME_NOT_ACTIVE` / `GAME_FINISHED` / `NOT_YOUR_TURN` / `STALE_MOVE` / `CELL_OCCUPIED`.
 */
const playMove = apiHandler(async (request: Request, { params }: Context) => {
  const input = moveCreateSchema.parse(await readJsonBody(request));
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => {
    const data = await cradle.gameMoveService.play(participant, gameId, input);
    if (data.you.kind === "guest") await refreshGuestCookie(cradle.serverConfig);
    return { data };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return playMove(request, context);
}
