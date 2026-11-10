import type { Locale } from "@gomoku/core/i18n/locales";
import { connection } from "next/server";

import type { NamespaceDict } from "@/i18n/catalogs/types";
import { getCurrentUser } from "@/server/http/auth";

import { AccountMenu } from "./account-menu";

/**
 * The right side of the top bar: the menu of the signed-in player, nothing for a guest. `locale` and `dict` are passed through as received: in Polish they are absent and the client menu uses its own Polish
 * default, so the catalog is not serialised into every page.
 */
export async function SessionMenu({ locale, dict }: { locale?: Locale; dict?: NamespaceDict<"header"> } = {}) {
  // Reads the session cookie and the database, so it renders per request.
  await connection();
  const user = await getCurrentUser();
  return user && <AccountMenu displayName={user.displayName} locale={locale} dict={dict} />;
}
