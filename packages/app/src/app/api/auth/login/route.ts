import { ConflictError, loginSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { getCurrentUser, setSessionCookie } from "@/server/http/auth";
import { clientKey } from "@/server/http/client-address";
import { hashOpaqueToken } from "@/server/http/opaque-token";

/** 30 attempts per hour and client address (any outcome; spec: kolejność w route). */
export const LOGIN_IP_LIMIT = 30;
export const LOGIN_IP_WINDOW_MS = 60 * 60 * 1000;
/** 10 failed attempts per 15 minutes and e-mail + address pair (H1). */
export const LOGIN_EMAIL_IP_LIMIT = 10;
export const LOGIN_EMAIL_IP_WINDOW_MS = 15 * 60 * 1000;
/** 100 failed attempts per hour and e-mail, against distributed attacks (H1). */
export const LOGIN_EMAIL_LIMIT = 100;
export const LOGIN_EMAIL_WINDOW_MS = 60 * 60 * 1000;

const login = apiHandler(async (request) => {
  const body = await readJsonBody(request);
  // A signed-in client gets a dedicated code and does not spend any attempt budget.
  if (await getCurrentUser()) {
    throw new ConflictError("Jesteś już zalogowany.", {
      code: "ALREADY_AUTHENTICATED",
    });
  }
  return withRequestScope(async ({ cradle }) => {
    const { rateLimiter } = cradle;
    const ipKey = clientKey(request.headers, "login", cradle.serverConfig);
    await rateLimiter.hit(ipKey, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS);
    const { email, password } = loginSchema.parse(body);
    // Keys are hashes: no e-mail or address in the table. The e-mail counters grow before
    // the (slow) password check, so parallel guesses cannot slip past the limit; a
    // successful login gives the attempt back, so only failures stay counted.
    const emailIpKey = `login:email-ip:${hashOpaqueToken(`${email}\n${ipKey}`)}`;
    const emailKey = `login:email:${hashOpaqueToken(email)}`;
    await rateLimiter.hit(
      emailIpKey,
      LOGIN_EMAIL_IP_LIMIT,
      LOGIN_EMAIL_IP_WINDOW_MS,
    );
    await rateLimiter.hit(emailKey, LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW_MS);
    const user = await cradle.userService.authenticate(email, password);
    await rateLimiter.reset(emailIpKey);
    await rateLimiter.reset(emailKey);
    const session = await cradle.sessionService.create(user.id);
    await setSessionCookie(cradle.serverConfig, session.token);
    return { data: { user }, status: 200 };
  });
});

export async function POST(request: Request) {
  await connection();
  return login(request);
}
