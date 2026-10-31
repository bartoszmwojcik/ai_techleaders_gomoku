import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentUserWith } from "@/server/http/auth";

import { HistoryView } from "./history-view";

export const metadata: Metadata = {
  title: "Historia partii — Gomoku",
  robots: { index: false, follow: false },
};

export default async function HistoryPage() {
  // Reads the session cookie and the database, so the page is rendered per request.
  await connection();
  // One request scope reads the session and the first page together.
  const session = await getCurrentUserWith((user, { gameHistoryService }) => gameHistoryService.list(user.id));
  // A visitor without an account (a guest included) has no history (BR-24); signing in brings them back here.
  if (!session) redirect("/login?next=%2Fhistory");
  return <HistoryView initial={session.data} />;
}
