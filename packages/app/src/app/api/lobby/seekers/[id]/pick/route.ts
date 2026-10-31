import { NotFoundError, seekerIdSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";

type Context = { params: Promise<{ id: string }> };

/**
 * Picks a seeker from the lobby as the opponent (#26, BR-09). No body; `id` is the id of the
 * `lobby_seekers` row. Order: CSRF (403), session (401), id (404), then the service: `200` with
 * `{ gameId }`; `404` (not a uuid), `409` `ACTIVE_GAME_EXISTS` / `LOBBY_SEEKER_TAKEN` / `LOBBY_SEEKER_EXPIRED` /
 * `CANNOT_PICK_SELF`, `429` `RATE_LIMITED`.
 */
const pickSeeker = apiHandler(async (_request: Request, { params }: Context) => {
  const user = await requireSession();
  const parsed = seekerIdSchema.safeParse((await params).id);
  if (!parsed.success) throw new NotFoundError("Nie znaleziono takiego gracza w lobby.");
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.lobbyService.pick(user.id, parsed.data),
  }));
});

export async function POST(request: Request, context: Context) {
  await connection();
  return pickSeeker(request, context);
}
