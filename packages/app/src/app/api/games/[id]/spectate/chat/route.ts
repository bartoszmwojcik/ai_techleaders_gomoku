import { chatReadQuerySchema, chatSendSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { resolveSpectator } from "@/server/http/spectator";

type Context = { params: Promise<{ id: string }> };

/**
 * The chat of a public game for its spectator (E10-S03, BR-41): the same page as a player's
 * (`?after_id=`, `?limit=`), from every sender - spectators carry `seat: null` and `spectatorName`.
 * A spectator has no setting here: the players' switches do not hide the conversation from them, and
 * there is no route to turn it off. Everyone who does not watch the game gets `404`. Never cached.
 */
const readChat = apiHandler(async (request: Request, { params }: Context) => {
  const search = new URL(request.url).searchParams;
  const query = chatReadQuerySchema.parse({
    after_id: search.get("after_id") ?? undefined,
    limit: search.get("limit") ?? undefined,
  });
  const { id } = await params;
  const { gameId, spectator } = await resolveSpectator(id);
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.chatService.readAsSpectator(spectator, gameId, { afterId: query.after_id, limit: query.limit }),
  }));
});

/**
 * Sends one message as the spectator. Body `{ text, clientId }`, the answers of the players' route:
 * `201` new, `200` a retry, `400` with `fieldErrors.text`, `409` `CHAT_UNAVAILABLE` / `CHAT_FULL`,
 * `429` `RATE_LIMITED`; a visitor without a nickname gets `403` (they only read).
 */
const sendChat = apiHandler(async (request: Request, { params }: Context) => {
  const input = chatSendSchema.parse(await readJsonBody(request));
  const { id } = await params;
  const { gameId, spectator } = await resolveSpectator(id);
  return withRequestScope(async ({ cradle }) => {
    const { created, ...data } = await cradle.chatService.sendAsSpectator(spectator, gameId, input);
    return { data, status: created ? 201 : 200 };
  });
});

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request, context: Context) {
  await connection();
  return noStore(await readChat(request, context));
}

export async function POST(request: Request, context: Context) {
  await connection();
  return noStore(await sendChat(request, context));
}
