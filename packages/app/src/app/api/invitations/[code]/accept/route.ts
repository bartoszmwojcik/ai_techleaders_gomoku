import { acceptInvitationSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { getCurrentUser } from "@/server/http/auth";
import {
  readGuestTokenHash,
  setGuestCookie,
} from "@/server/http/guest-cookie";
import { lookupGuard } from "@/server/http/invitation-lookup";

type Context = { params: Promise<{ code: string }> };

/**
 * Joins the signed-in user, or a visitor without an account as a guest (token in the
 * `gomoku_guest` cookie, #21 step 6), to the game behind the invitation. Order: input (400),
 * then the service: session (401) or `GUEST_NOT_ALLOWED` (409), the pool of failed lookups
 * (429), and the atomic join. An unknown, used, expired or cancelled code is one uniform `410`.
 */
const accept = apiHandler(async (request: Request, { params }: Context) => {
  const { code } = await params;
  const input = acceptInvitationSchema.parse(await readJsonBody(request));
  const user = await getCurrentUser();
  return withRequestScope(async ({ cradle }) => {
    const { gameId, guestToken } = await cradle.invitationService.accept(
      code,
      {
        userId: user?.id,
        guestTokenHash: await readGuestTokenHash(cradle.serverConfig),
      },
      input,
      lookupGuard(request.headers, cradle.serverConfig),
    );
    // A new guest gets the token in the cookie only, never in the answer.
    if (guestToken) await setGuestCookie(cradle.serverConfig, guestToken);
    return { data: { gameId } };
  });
});

export async function POST(request: Request, context: Context) {
  await connection();
  return accept(request, context);
}
