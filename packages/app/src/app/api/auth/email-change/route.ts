import { emailChangeSchema } from "@gomoku/core";
import { after, connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";
import { describeError } from "@/server/http/describe-error";

/** The same pool as the password change (Q4): two forms must not double the guesses at the password. */
export const EMAIL_CHANGE_PASSWORD_LIMIT = 10;
export const EMAIL_CHANGE_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

/**
 * Asks to change the account's e-mail address (E05-S01). Order: session (401), input (400, spends
 * no attempt), the shared password counter grows before the slow password check and a correct
 * password gives the attempt back, the service checks the password (400) and the account limit
 * (429). The answer is then always `202`: whether the address is free, limited or failing to
 * send is decided in `after()`, so neither the body nor the timing tells (BR-16).
 */
const requestChange = apiHandler(async (request) => {
  const user = await requireSession();
  const { newEmail, currentPassword } = emailChangeSchema.parse(await readJsonBody(request));
  const target = await withRequestScope(async ({ cradle }) => {
    const key = `password-change:user:${user.id}`;
    await cradle.rateLimiter.hit(key, EMAIL_CHANGE_PASSWORD_LIMIT, EMAIL_CHANGE_PASSWORD_WINDOW_MS);
    const account = await cradle.emailChangeService.request(user.id, newEmail, currentPassword);
    await cradle.rateLimiter.reset(key);
    return account;
  });
  after(async () => {
    try {
      await withRequestScope(({ cradle }) => cradle.emailChangeService.deliver(target, newEmail));
    } catch (error) {
      // Class name and code only: never the address or the token.
      console.error("E-mail change request failed", describeError(error));
    }
  });
  return { data: null, status: 202 };
});

export async function POST(request: Request) {
  await connection();
  return requestChange(request);
}
