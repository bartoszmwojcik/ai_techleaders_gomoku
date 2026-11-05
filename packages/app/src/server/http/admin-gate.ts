import { isInstallationAdmin } from "@gomoku/core";
import { notFound } from "next/navigation";

import { type CurrentUser, getCurrentUserWith } from "./auth";
import { logSecurityEvent } from "./security-log";

/**
 * Gate of the admin panel (E08-S02, BR-35, BR-37). EVERY `page.tsx`, `route.ts` and server action
 * under `app/(backend)` must call it before reading any panel data: a layout does not wrap route
 * handlers or actions and is not re-run on client navigation (`admin-gate.test.ts` enforces it).
 *
 * The role is read from the configuration on each request (`ADMIN_EMAIL`), never from the
 * database or the request, and an unconfirmed e-mail does not count. Anyone else (no session,
 * expired session, another player, an unavailable database, an unset `ADMIN_EMAIL`) gets the 404
 * of a page that does not exist: no redirect, no hint that a panel exists (fail closed).
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const current = await getCurrentUserWith(async (_user, cradle) => cradle.serverConfig.adminEmail);
  if (!current || !current.user.emailVerifiedAt || !isInstallationAdmin(current.user.email, current.data)) {
    logSecurityEvent("admin_denied");
    notFound();
  }
  return current.user;
}
