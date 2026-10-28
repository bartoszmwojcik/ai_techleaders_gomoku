import { cookies } from "next/headers";

import type { ServerConfig } from "../config";
import { withRequestScope } from "../container";
import { SESSION_TTL_MS } from "../services/auth/session-service";

type CookieConfig = Pick<ServerConfig, "sessionCookieSecure">;

/**
 * The cookie outlives the session by one hour, so the browser does not drop it during a
 * game covered by the G5 exception; the server alone decides whether a session is valid.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000 + 60 * 60;

export type CurrentUser = {
  id: string;
  displayName: string;
  emailVerifiedAt: Date | null;
};

/**
 * `__Host-` prefix when the cookie is `Secure` (G2: no `Domain`, `Path=/`, so a sibling
 * subdomain cannot plant it); the prefix requires HTTPS, hence the plain name otherwise.
 */
export function sessionCookieName(config: CookieConfig): string {
  return config.sessionCookieSecure
    ? "__Host-gomoku_session"
    : "gomoku_session";
}

function cookieAttributes(config: CookieConfig) {
  return {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax",
    path: "/",
  } as const;
}

export async function setSessionCookie(
  config: CookieConfig,
  token: string,
): Promise<void> {
  (await cookies()).set(sessionCookieName(config), token, {
    ...cookieAttributes(config),
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(config: CookieConfig): Promise<void> {
  (await cookies()).set(sessionCookieName(config), "", {
    ...cookieAttributes(config),
    maxAge: 0,
  });
}

/**
 * The user behind the session cookie, or `null` when there is no valid session. Any
 * failure (e.g. unavailable database, invalid configuration) also yields `null`: fail
 * closed, so pages never show someone else's identity and never crash because of it.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await withRequestScope(async ({ cradle }) => {
      const token = (await cookies()).get(
        sessionCookieName(cradle.serverConfig),
      )?.value;
      if (!token) return null;
      const session = await cradle.sessionService.findValid(token);
      if (!session) return null;
      const { id, displayName, emailVerifiedAt } = session.user;
      return { id, displayName, emailVerifiedAt: emailVerifiedAt ?? null };
    });
  } catch (error) {
    console.error("Session lookup failed", error);
    return null;
  }
}
