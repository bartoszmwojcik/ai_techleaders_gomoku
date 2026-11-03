import { gameIdSchema } from "@gomoku/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { getCurrentUserWith } from "@/server/http/auth";

import { ReviewView } from "./review-view";

export const metadata: Metadata = {
  title: "Przegląd partii — Gomoku",
  // The code of a public game may be in the address: it must not leak through the Referer header.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

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
  if (code !== undefined) {
    // Needs no session and reads none: the code is the proof (an array or a wrong code is a 404 too).
    const review =
      typeof code === "string"
        ? await withRequestScope(({ cradle }) => cradle.gameReviewService.open({ kind: "code", code }, gameId))
        : null;
    if (!review) notFound();
    return <ReviewView review={review} back={{ href: "/", label: "Wróć na stronę główną" }} />;
  }
  const session = await getCurrentUserWith((user, { gameReviewService }) =>
    gameReviewService.open({ kind: "account", userId: user.id }, gameId),
  );
  // Without an account there is no history (BR-24); signing in brings the visitor back here.
  if (!session) redirect(`/login?next=${encodeURIComponent(`/games/${gameId}/review`)}`);
  // One answer for a missing game, a removed one, a game still in play and somebody else's (N-05).
  if (!session.data) notFound();
  return <ReviewView review={session.data} back={{ href: "/history", label: "Wróć do historii" }} />;
}
