import { chatReadQuerySchema, chatSendSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * The chat of a game for its participant (E07-S01): `?after_id=` (the number of the last message the
 * client has; absent = the latest `limit`) and `?limit=`. The sender is a seat, never an account.
 * Everyone who does not play in the game gets the same `404`; a cursor outside the `integer` range is `400`.
 * The answer is never cached: it is somebody's conversation.
 */
const readChat = apiHandler(async (request: Request, { params }: Context) => {
  const search = new URL(request.url).searchParams;
  const query = chatReadQuerySchema.parse({
    after_id: search.get("after_id") ?? undefined,
    limit: search.get("limit") ?? undefined,
  });
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.chatService.read(participant, gameId, { afterId: query.after_id, limit: query.limit }),
  }));
});

/**
 * Sends one message. Body `{ text, clientId }`: the same `clientId` is the same attempt, so a retry
 * after a lost answer returns the stored message (`200`) instead of a duplicate. `201` for a new message,
 * `400` with `fieldErrors.text` for a refused text (the message never repeats it), `409`
 * `CHAT_UNAVAILABLE` / `CHAT_DISABLED` / `CHAT_FULL`, `429` `RATE_LIMITED` with `retryAfterMs`.
 */
const sendChat = apiHandler(async (request: Request, { params }: Context) => {
  const input = chatSendSchema.parse(await readJsonBody(request));
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => {
    const { created, ...data } = await cradle.chatService.send(participant, gameId, input);
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
