import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { clientI18n, getI18n } from "@/i18n/server";
import { getCurrentUserWith } from "@/server/http/auth";

import { HistoryView } from "./history-view";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n("history");
  return { title: t("meta.title"), robots: { index: false, follow: false } };
}

export default async function HistoryPage() {
  // Reads the session cookie and the database, so the page is rendered per request.
  await connection();
  // One request scope reads the session and the first page together.
  const session = await getCurrentUserWith((user, { gameHistoryService }) => gameHistoryService.list(user.id));
  // A visitor without an account (a guest included) has no history (BR-24); signing in brings them back here.
  if (!session) redirect("/login?next=%2Fhistory");
  return (
    <HistoryView
      initial={session.data}
      {...clientI18n(await getI18n("history"))}
      commonTexts={clientI18n(await getI18n("common"))}
      homeTexts={clientI18n(await getI18n("home"))}
    />
  );
}
