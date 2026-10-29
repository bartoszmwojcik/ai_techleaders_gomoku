import { ValidationError, acceptInvitationSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { getCurrentUser } from "@/server/http/auth";
import { lookupGuard } from "@/server/http/invitation-lookup";

type Context = { params: Promise<{ code: string }> };

/**
 * Joins the signed-in user to the game behind the invitation (#21 step 4). Order: input
 * (400), then the service: session (401), the pool of failed lookups (429), and the atomic
 * join. An unknown, used, expired or cancelled code is one uniform `410`.
 */
const accept = apiHandler(async (request: Request, { params }: Context) => {
  const { code } = await params;
  const input = acceptInvitationSchema.parse(await readJsonBody(request));
  if (input.as === "guest") {
    throw new ValidationError("Dołączanie jako gość nie jest jeszcze dostępne.");
  }
  const user = await getCurrentUser();
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.invitationService.accept(
      code,
      { userId: user?.id },
      { ...input, as: "user" },
      lookupGuard(request.headers, cradle.serverConfig),
    ),
  }));
});

export async function POST(request: Request, context: Context) {
  await connection();
  return accept(request, context);
}
