import type { Locale } from "@gomoku/core/i18n/locales";
import { connection } from "next/server";

import plHeader from "@/i18n/catalogs/pl/header";
import type { NamespaceDict } from "@/i18n/catalogs/types";
import { getCurrentUser } from "@/server/http/auth";

import { AccountMenu } from "./account-menu";

/** The right side of the top bar: the menu of the signed-in player, nothing for a guest. */
export async function SessionMenu({
  locale = "pl",
  dict = plHeader,
}: { locale?: Locale; dict?: NamespaceDict<"header"> } = {}) {
  // Reads the session cookie and the database, so it renders per request.
  await connection();
  const user = await getCurrentUser();
  return user && <AccountMenu displayName={user.displayName} locale={locale} dict={dict} />;
}
