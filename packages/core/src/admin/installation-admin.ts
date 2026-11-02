import { normalizeEmail } from "../validators/auth/normalize";

/** Shown when someone tries to delete the installation administrator's account (E08-S01). */
export const ADMIN_ACCOUNT_PROTECTED_MESSAGE = "Tego konta nie można usunąć.";

/**
 * The only place that decides who the installation administrator is (BR-35): the account whose
 * e-mail equals `ADMIN_EMAIL`, both sides normalized. Without a configured address nobody is.
 */
export function isInstallationAdmin(email: string, adminEmail: string | undefined): boolean {
  if (!adminEmail) return false;
  return normalizeEmail(email) === normalizeEmail(adminEmail);
}
