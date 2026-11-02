import { SPECTATOR_ACCESS_MS } from "@gomoku/core";
import { cookies } from "next/headers";

import type { ServerConfig } from "../config";
import { hashOpaqueToken } from "./opaque-token";

type CookieConfig = Pick<ServerConfig, "sessionCookieSecure">;

/**
 * The spectator's token (E10-S02, S2-5) travels in a cookie of its own, apart from the guest's: a
 * guest cookie never lets anybody watch and a spectator cookie never lets anybody play, so the
 * resolvers of the two cannot be confused. Its lifetime is the access window of the spectator
 * (one hour from the last read); the server alone decides whether the token still works.
 */
export const SPECTATOR_COOKIE_MAX_AGE_SECONDS = SPECTATOR_ACCESS_MS / 1000;

/** `__Host-` prefix when `Secure`, like the session cookie (it requires HTTPS). */
export function spectatorCookieName(config: CookieConfig): string {
  return config.sessionCookieSecure ? "__Host-gomoku_spectator" : "gomoku_spectator";
}

export async function setSpectatorCookie(config: CookieConfig, token: string): Promise<void> {
  (await cookies()).set(spectatorCookieName(config), token, {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: SPECTATOR_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Sliding expiry: sets the cookie the browser already carries again, with a fresh `Max-Age`. Without
 * a cookie (an account watching) it does nothing.
 */
export async function refreshSpectatorCookie(config: CookieConfig): Promise<void> {
  const token = await readSpectatorToken(config);
  if (token) await setSpectatorCookie(config, token);
}

async function readSpectatorToken(config: CookieConfig): Promise<string | undefined> {
  return (await cookies()).get(spectatorCookieName(config))?.value || undefined;
}

/** SHA-256 of the spectator token the browser carries, or `undefined` without the cookie. */
export async function readSpectatorTokenHash(config: CookieConfig): Promise<string | undefined> {
  const token = await readSpectatorToken(config);
  return token ? hashOpaqueToken(token) : undefined;
}
