import { formatInvitationCode, normalizeInvitationCode } from "@gomoku/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { loadInvitationView } from "@/server/http/invitation-view";

import { InviteScreen } from "./invite-screen";

// The code is in the address: it must not leak through the Referer header (#21 Sensitive data).
export const metadata: Metadata = {
  title: "Zaproszenie do partii — Gomoku",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type InvitePageProps = {
  params: Promise<{ code: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  // Reads the session and guest cookies and a per-request limit pool: rendered per request.
  await connection();
  const { code } = await params;
  const view = await loadInvitationView(code);
  // Already a player here, or the creator: the game page is the right place (s07.4, s07.5).
  if (view.kind === "redirect") redirect(`/games/${view.gameId}`);
  const normalized = normalizeInvitationCode(code);
  return <InviteScreen code={normalized ? formatInvitationCode(normalized) : ""} view={view} />;
}
