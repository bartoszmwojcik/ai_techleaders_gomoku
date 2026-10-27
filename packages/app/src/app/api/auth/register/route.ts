import { registerSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { setSessionCookie } from "@/server/http/auth";
import { clientKey } from "@/server/http/client-address";

/** 5 attempts (successful or not) per hour and client address (spec: Limit prób). */
export const REGISTER_LIMIT = 5;
export const REGISTER_WINDOW_MS = 60 * 60 * 1000;

const register = apiHandler(async (request) => {
  const body = await readJsonBody(request);
  return withRequestScope(async ({ cradle }) => {
    // Counted before validation and hashing, in its own committed transaction, so a `400`
    // or `409` outcome never gives the attempt back.
    await cradle.rateLimiter.consume(
      clientKey(request.headers, "register", cradle.serverConfig),
      REGISTER_LIMIT,
      REGISTER_WINDOW_MS,
    );
    const input = registerSchema.parse(body);
    const { user, session } = await cradle.userService.register(input);
    await setSessionCookie(cradle.serverConfig, session.token);
    return { data: { user }, status: 201 };
  });
});

export async function POST(request: Request) {
  await connection();
  return register(request);
}
