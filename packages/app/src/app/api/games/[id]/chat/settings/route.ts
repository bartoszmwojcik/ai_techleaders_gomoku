import { chatSettingsSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { resolveParticipant } from "@/server/http/participant";

type Context = { params: Promise<{ id: string }> };

/**
 * Turns the chat on or off for the asking participant (E07-S02). Body `{ enabled }`; the answer is
 * `{ state }`, the chat as the asker sees it afterwards. Idempotent: the same value again is `200`
 * and writes nothing. Everyone who does not play in the game gets the same `404`; `409`
 * `CHAT_UNAVAILABLE` while the game waits or the chat is closed. The agent has no way here: its token is
 * not a participant session, and the service refuses its kind anyway.
 */
const putSettings = apiHandler(async (request: Request, { params }: Context) => {
  const input = chatSettingsSchema.parse(await readJsonBody(request));
  const { id } = await params;
  const { gameId, participant } = await resolveParticipant(id);
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.chatService.setEnabled(participant, gameId, input.enabled),
  }));
});

export async function PUT(request: Request, context: Context) {
  await connection();
  const response = await putSettings(request, context);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
