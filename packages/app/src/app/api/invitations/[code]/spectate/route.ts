import { spectateInvitationSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readOptionalJsonBody } from "@/server/http/api-handler";
import { getCurrentUser } from "@/server/http/auth";
import { lookupGuard } from "@/server/http/invitation-lookup";
import { readSpectatorTokenHash, setSpectatorCookie } from "@/server/http/spectator-cookie";

type Context = { params: Promise<{ code: string }> };

/**
 * Makes the visitor a spectator of the public game behind the code (E10-S02, BR-39), once both
 * seats are taken: an account by its session, a visitor by a token in the `gomoku_spectator` cookie,
 * with an optional nickname. Order: input (400), the pool of failed lookups (429), the join. `409
 * SPECTATORS_FULL` is "Partia ma komplet widzów" (BR-42); an unknown, private or finished game's
 * code is the uniform `410` of the invitation routes.
 */
const spectate = apiHandler(async (request: Request, { params }: Context) => {
  const { code } = await params;
  const input = spectateInvitationSchema.parse(await readOptionalJsonBody(request));
  const user = await getCurrentUser();
  return withRequestScope(async ({ cradle }) => {
    const { gameId, spectatorToken } = await cradle.spectatorService.join(
      code,
      { userId: user?.id, tokenHash: await readSpectatorTokenHash(cradle.serverConfig) },
      input,
      lookupGuard(request.headers, cradle.serverConfig),
    );
    // A new spectator gets the token in the cookie only, never in the answer.
    if (spectatorToken) await setSpectatorCookie(cradle.serverConfig, spectatorToken);
    return { data: { gameId } };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return spectate(request, context);
}
