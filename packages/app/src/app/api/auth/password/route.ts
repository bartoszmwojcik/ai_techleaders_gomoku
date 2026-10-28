import { passwordChangeSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { requireSessionWithId } from "@/server/http/auth";

/** 10 failed attempts per 15 minutes and account, so a stolen session cannot guess the password (Q1). */
export const PASSWORD_CHANGE_LIMIT = 10;
export const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Changes the password of the signed-in user and ends their other sessions; the current one
 * stays. Order: session (401), input (400, spends no attempt), then the per-account counter
 * grows before the slow password check so parallel guesses cannot slip past it, and a
 * successful change gives the attempt back, so only failures stay counted.
 */
const changePassword = apiHandler(async (request) => {
  const { user, sessionId } = await requireSessionWithId();
  const { currentPassword, newPassword } = passwordChangeSchema.parse(
    await readJsonBody(request),
  );
  return withRequestScope(async ({ cradle }) => {
    const { rateLimiter } = cradle;
    const key = `password-change:user:${user.id}`;
    await rateLimiter.hit(
      key,
      PASSWORD_CHANGE_LIMIT,
      PASSWORD_CHANGE_WINDOW_MS,
    );
    await cradle.userService.changePassword(
      user.id,
      sessionId,
      currentPassword,
      newPassword,
    );
    await rateLimiter.reset(key);
    return { data: null, status: 200 };
  });
});

export async function POST(request: Request) {
  await connection();
  return changePassword(request);
}
