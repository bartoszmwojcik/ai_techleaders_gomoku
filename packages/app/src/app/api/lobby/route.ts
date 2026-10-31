import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";

/**
 * The lobby for the signed-in user (#25): their own "looking for a game" status, the game they
 * hold (BR-13) and the other seekers, oldest first. Times are relative and computed by the
 * server (`expiresInMs`, `sinceMs`). Polled every 3 s by the page.
 */
const getLobby = apiHandler(async () => {
  const user = await requireSession();
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.lobbyService.view(user.id),
  }));
});

export async function GET(request: Request) {
  await connection();
  return getLobby(request);
}
