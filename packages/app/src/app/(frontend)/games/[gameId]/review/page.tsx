import { gameIdSchema } from "@gomoku/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { I18nProvider } from "@/i18n/context";
import { getI18n, providerI18n } from "@/i18n/server";
import { withRequestScope } from "@/server/container";
import { getCurrentUserWith } from "@/server/http/auth";

import { ReviewView } from "./review-view";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n("review");
  // The code of a public game may be in the address: it must not leak through the Referer header.
  return { title: t("meta.title"), referrer: "no-referrer", robots: { index: false, follow: false } };
}

type ReviewPageProps = {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
};

/**
 * `/games/[gameId]/review`: a finished game, move by move. A participant with an account opens it
 * from the history (E09-S01); anybody, also without an account, opens a public one with its
 * invitation code in `?code=` (E09-S02, BR-44). `GameReviewService` decides who gets in.
 */
export default async function ReviewPage({ params, searchParams }: ReviewPageProps) {
  // Reads the session cookie and the database: rendered per request.
  await connection();
  const { gameId } = await params;
  // A malformed id is the same 404 as a missing game, and needs no session to say so.
  if (!gameIdSchema.safeParse(gameId).success) notFound();
  const { code } = await searchParams;
  const review = await getI18n("review");
  // The review's namespaces, joined with the segment layout's `common` (spec Q10); nothing in Polish.
  const texts = providerI18n(review, await getI18n("game"), await getI18n("history"));
  if (code !== undefined) {
    // Needs no session and reads none: the code is the proof (an array or a wrong code is a 404 too).
    const opened =
      typeof code === "string"
        ? await withRequestScope(({ cradle }) => cradle.gameReviewService.open({ kind: "code", code }, gameId))
        : null;
    if (!opened) notFound();
    return (
      <I18nProvider {...texts}>
        <ReviewView review={opened} back={{ href: "/", label: review.t("backHome") }} />
      </I18nProvider>
    );
  }
  const session = await getCurrentUserWith((user, { gameReviewService }) =>
    gameReviewService.open({ kind: "account", userId: user.id }, gameId),
  );
  // Without an account there is no history (BR-24); signing in brings the visitor back here.
  if (!session) redirect(`/login?next=${encodeURIComponent(`/games/${gameId}/review`)}`);
  // One answer for a missing game, a removed one, a game still in play and somebody else's (N-05).
  if (!session.data) notFound();
  return (
    <I18nProvider {...texts}>
      <ReviewView review={session.data} back={{ href: "/history", label: review.t("backToHistory") }} />
    </I18nProvider>
  );
}
