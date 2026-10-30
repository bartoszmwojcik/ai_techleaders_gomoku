import { UnauthorizedError, ValidationError, accountDeleteSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { clearSessionCookie, requireSessionWithId } from "@/server/http/auth";

/**
 * 10 wrong passwords per 15 minutes and account (Q2), so a stolen session cannot guess the
 * password to delete the account. Only wrong passwords stay counted.
 */
export const ACCOUNT_DELETE_LIMIT = 10;
export const ACCOUNT_DELETE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Deletes the signed-in account (E01-S06, #37). Order: CSRF (403), session (401), input (400,
 * spends no attempt), the per-account counter grows before the slow password check (429), then
 * the service. A wrong password stays counted; every other outcome gives the attempt back and a
 * success forgets the counter. The session cookie is removed after a success and when the
 * account turned out to be gone already (a concurrent deletion); on any other failure it stays,
 * so the user can retry. A POST, not a DELETE: proxies drop the body of a DELETE.
 */
const deleteAccount = apiHandler(async (request) => {
  const { user } = await requireSessionWithId();
  const { password } = accountDeleteSchema.parse(await readJsonBody(request));
  return withRequestScope(async ({ cradle }) => {
    const { rateLimiter, accountService, serverConfig } = cradle;
    const key = `account-delete:user:${user.id}`;
    await rateLimiter.hit(key, ACCOUNT_DELETE_LIMIT, ACCOUNT_DELETE_WINDOW_MS);
    try {
      await accountService.delete(user.id, password);
    } catch (error) {
      const wrongPassword = error instanceof ValidationError && error.code === "INVALID_PASSWORD";
      if (!wrongPassword) {
        await rateLimiter.release(key, ACCOUNT_DELETE_WINDOW_MS).catch(() => undefined);
      }
      if (error instanceof UnauthorizedError) await clearSessionCookie(serverConfig);
      throw error;
    }
    await rateLimiter.reset(key);
    await clearSessionCookie(serverConfig);
    return { data: null, status: 200 };
  });
});

export async function POST(request: Request) {
  await connection();
  return deleteAccount(request);
}
