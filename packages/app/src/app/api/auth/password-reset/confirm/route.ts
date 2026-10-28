import { passwordResetConfirmSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { clientKey } from "@/server/http/client-address";

/** Q4: 10 confirmations per 15 minutes and client address (any outcome). */
export const PASSWORD_RESET_CONFIRM_IP_LIMIT = 10;
export const PASSWORD_RESET_CONFIRM_IP_WINDOW_MS = 15 * 60 * 1000;

/**
 * Sets a new password with the token from the e-mail. No session is needed (the link is the
 * proof) and nobody is logged in afterwards (Q5); the service deletes all sessions of the
 * account. The address limit comes first, so every request spends it.
 */
const confirm = apiHandler(async (request) => {
  return withRequestScope(async ({ cradle }) => {
    await cradle.rateLimiter.hit(
      clientKey(request.headers, "password-reset-confirm", cradle.serverConfig),
      PASSWORD_RESET_CONFIRM_IP_LIMIT,
      PASSWORD_RESET_CONFIRM_IP_WINDOW_MS,
    );
    const { token, newPassword } = passwordResetConfirmSchema.parse(
      await readJsonBody(request),
    );
    await cradle.passwordResetService.confirm(token, newPassword);
    return { data: null, status: 200 };
  });
});

export async function POST(request: Request) {
  await connection();
  return confirm(request);
}
