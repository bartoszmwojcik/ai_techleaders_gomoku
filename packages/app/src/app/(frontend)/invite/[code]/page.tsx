import { formatInvitationCode, normalizeInvitationCode } from "@gomoku/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { clientI18n, getI18n } from "@/i18n/server";
import { loadInvitationView } from "@/server/http/invitation-view";

import { InviteScreen } from "./invite-screen";

// The code is in the address: it must not leak through the Referer header (#21 Sensitive data).
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n("home");
  return { title: t("meta.invite"), referrer: "no-referrer", robots: { index: false, follow: false } };
}

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
  // A finished public game: anybody with the code may step through it (E09-S02, BR-44).
  if (view.kind === "review") redirect(`/games/${view.gameId}/review?code=${normalized!}`);
  const home = await getI18n("home");
  const common = await getI18n("common");
  return (
    <InviteScreen
      code={normalized ? formatInvitationCode(normalized) : ""}
      view={view}
      texts={clientI18n(home)}
      commonTexts={clientI18n(common)}
      errorTexts={clientI18n(await getI18n("errors"))}
    />
  );
}
