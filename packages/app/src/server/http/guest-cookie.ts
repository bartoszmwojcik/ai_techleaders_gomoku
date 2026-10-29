import { cookies } from "next/headers";

import type { ServerConfig } from "../config";
import { hashOpaqueToken } from "./opaque-token";

type CookieConfig = Pick<ServerConfig, "sessionCookieSecure">;

/**
 * Two hours (#21 Q10): a game lasts at most ~20 minutes, plus the hour the token keeps working
 * after it. The server alone decides whether a token is valid; the cookie is only the carrier.
 */
export const GUEST_COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60;

/** `__Host-` prefix when `Secure`, like the session cookie (it requires HTTPS). */
export function guestCookieName(config: CookieConfig): string {
  return config.sessionCookieSecure ? "__Host-gomoku_guest" : "gomoku_guest";
}

function attributes(config: CookieConfig) {
  return {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax",
    path: "/",
  } as const;
}

export async function setGuestCookie(
  config: CookieConfig,
  token: string,
): Promise<void> {
  (await cookies()).set(guestCookieName(config), token, {
    ...attributes(config),
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Sliding expiry: sets the cookie the browser already carries again, with a fresh `Max-Age`.
 * Only the carrier is extended; whether the token works is still decided by the server alone
 * (`GUEST_TOKEN_VALID_SQL`). Without a cookie it does nothing.
 */
export async function refreshGuestCookie(config: CookieConfig): Promise<void> {
  const store = await cookies();
  const token = store.get(guestCookieName(config))?.value;
  if (token) await setGuestCookie(config, token);
}

/** SHA-256 of the guest token the browser carries, or `undefined` without the cookie. */
export async function readGuestTokenHash(
  config: CookieConfig,
): Promise<string | undefined> {
  const token = (await cookies()).get(guestCookieName(config))?.value;
  return token ? hashOpaqueToken(token) : undefined;
}
