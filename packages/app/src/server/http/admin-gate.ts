import { isInstallationAdmin, NotFoundError } from "@gomoku/core";
import { notFound } from "next/navigation";

import { GAME_NOT_FOUND_MESSAGE } from "../services/games/game-service";
import { type CurrentUser, getCurrentUserWith } from "./auth";
import { logSecurityEvent } from "./security-log";

/**
 * The one decision behind both gates (E08-S02, BR-35, BR-37; show-mode B1): the administrator of this
 * installation, or `null` for anybody else. The role is read from the configuration on each request
 * (`ADMIN_EMAIL`), never from the database or the request, and an unconfirmed e-mail does not count. No
 * session, an expired session, another player, an unavailable database and an unset `ADMIN_EMAIL` are all
 * `null` (fail closed); every denial is logged without the account.
 */
export async function isAdminSession(): Promise<CurrentUser | null> {
  const current = await getCurrentUserWith(async (_user, cradle) => cradle.serverConfig.adminEmail);
  if (!current || !current.user.emailVerifiedAt || !isInstallationAdmin(current.user.email, current.data)) {
    logSecurityEvent("admin_denied");
    return null;
  }
  return current.user;
}

/**
 * Gate of the admin pages: the panel `app/(backend)` and the show pages `app/(frontend)/show`. EVERY
 * `page.tsx`, `layout.tsx`, `route.ts` and server action there must call it before reading anything: a
 * layout does not wrap route handlers or actions and is not re-run on client navigation (guards:
 * `admin-gate.guard.test.ts`, `show-routes.guard.test.ts`). Anyone else gets the 404 of a page that does
 * not exist: no redirect, no hint that the page exists.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const admin = await isAdminSession();
  if (!admin) notFound();
  return admin;
}

/**
 * The same gate for the route handlers of `/api/show*` (show-mode, "API Contracts"): `notFound()` would end
 * as a `500` in `apiHandler`, so anybody but the administrator gets `404 NOT_FOUND` with the message of a
 * missing game - the answer of a route for a game that does not exist.
 * @throws AppError 404
 */
export async function requireAdminApi(): Promise<CurrentUser> {
  const admin = await isAdminSession();
  if (!admin) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
  return admin;
}
