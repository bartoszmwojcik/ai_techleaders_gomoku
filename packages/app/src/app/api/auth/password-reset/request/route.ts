import { passwordResetRequestSchema } from "@gomoku/core";
import { after, connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { clientKey } from "@/server/http/client-address";
import { describeError } from "@/server/http/describe-error";

/** Q4: 10 requests per hour and client address (the per-e-mail limit lives in the service). */
export const PASSWORD_RESET_REQUEST_IP_LIMIT = 10;
export const PASSWORD_RESET_REQUEST_IP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Asks for a password reset link. The answer is always the same `200` once the address limit
 * and the body shape pass, whatever the account is (unknown, unconfirmed, confirmed, limited
 * or failing to send): all work that depends on the account runs in `after()` in its own
 * request scope, so neither the body nor the timing tells. The address limit comes first so
 * malformed requests spend it too; `clientKey` fails closed in production when the address
 * is unknown (Q10).
 */
const requestReset = apiHandler(async (request) => {
  await withRequestScope(({ cradle }) =>
    cradle.rateLimiter.hit(
      clientKey(request.headers, "password-reset-request", cradle.serverConfig),
      PASSWORD_RESET_REQUEST_IP_LIMIT,
      PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
    ),
  );
  const { email } = passwordResetRequestSchema.parse(
    await readJsonBody(request),
  );
  after(async () => {
    try {
      await withRequestScope(({ cradle }) =>
        cradle.passwordResetService.request(email),
      );
    } catch (error) {
      // Class name and code only: never the address or the token.
      console.error("Password reset request failed", describeError(error));
    }
  });
  return { data: null, status: 200 };
});

export async function POST(request: Request) {
  await connection();
  return requestReset(request);
}
