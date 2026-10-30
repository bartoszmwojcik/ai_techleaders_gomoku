import { cookies } from "next/headers";

import { GUEST_TOKEN_GRACE_MS } from "@gomoku/core";

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

/**
 * Lifetime of the guest cookie for a game the guest has just created or reads (E02-S08, Q6, L29):
 * a game that still waits keeps the cookie until one hour after its invitation expires (the
 * window in which the token still shows "invitation expired"); every other state keeps the
 * two hours of a joiner.
 */
export function guestCookieMaxAge(
  game: { status: string; invitation?: { expiresAt: Date } },
  now: Date,
): number {
  if (game.status !== "waiting" || !game.invitation) return GUEST_COOKIE_MAX_AGE_SECONDS;
  const untilMs = game.invitation.expiresAt.getTime() + GUEST_TOKEN_GRACE_MS - now.getTime();
  return Math.max(1, Math.ceil(untilMs / 1000));
}

export async function setGuestCookie(
  config: CookieConfig,
  token: string,
  maxAgeSeconds: number = GUEST_COOKIE_MAX_AGE_SECONDS,
): Promise<void> {
  (await cookies()).set(guestCookieName(config), token, {
    ...attributes(config),
    maxAge: maxAgeSeconds,
  });
}

/**
 * Sliding expiry: sets the cookie the browser already carries again, with a fresh `Max-Age`.
 * Only the carrier is extended; whether the token works is still decided by the server alone
 * (`GUEST_TOKEN_VALID_SQL`). Without a cookie it does nothing.
 */
export async function refreshGuestCookie(
  config: CookieConfig,
  maxAgeSeconds: number = GUEST_COOKIE_MAX_AGE_SECONDS,
): Promise<void> {
  const store = await cookies();
  const token = store.get(guestCookieName(config))?.value;
  if (token) await setGuestCookie(config, token, maxAgeSeconds);
}

/** SHA-256 of the guest token the browser carries, or `undefined` without the cookie. */
export async function readGuestTokenHash(
  config: CookieConfig,
): Promise<string | undefined> {
  const token = (await cookies()).get(guestCookieName(config))?.value;
  return token ? hashOpaqueToken(token) : undefined;
}
