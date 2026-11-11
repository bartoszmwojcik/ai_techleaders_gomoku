import type { Metadata } from "next";
import { connection } from "next/server";

import { clientI18n, getI18n } from "@/i18n/server";
import { requireAdmin } from "@/server/http/admin-gate";
import { loadShowOverview } from "@/server/http/show-view";

import { ShowConsole } from "./show-console";

// No title of its own: the 404 every other visitor gets must not name the show.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * `/show`, the administrator's show console (show-mode, P3): `requireAdmin()` first, so everybody else gets the 404
 * of a page that does not exist. No `loading.tsx` (it would hide the 404 status, lesson 2026-10-29).
 */
export default async function ShowConsolePage() {
  await connection();
  await requireAdmin();
  const overview = await loadShowOverview();
  const texts = clientI18n(await getI18n("show"));
  return <ShowConsole initial={overview} {...texts} />;
}
