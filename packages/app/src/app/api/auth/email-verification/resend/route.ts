import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";
import { clientKey } from "@/server/http/client-address";

/**
 * Sends a new confirmation link to the signed-in player. Order: session (401), then the
 * service checks "already confirmed" (409), the account and address limits (429, Q4) and
 * only then does the costly work (the daily quota, the send). Bodyless; `apiHandler`
 * enforces the CSRF headers (403). The route has no `next`: the link leads to `/`.
 */
const resend = apiHandler(async (request) => {
  const user = await requireSession();
  await withRequestScope(({ cradle }) =>
    cradle.emailVerificationService.resend(
      user,
      clientKey(request.headers, "verification-resend", cradle.serverConfig),
    ),
  );
  return { data: null, status: 200 };
});

export async function POST(request: Request) {
  await connection();
  return resend(request);
}
