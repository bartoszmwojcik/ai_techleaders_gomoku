import { gameIdSchema } from "@gomoku/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentUserWith } from "@/server/http/auth";

import { ReviewView } from "./review-view";

export const metadata: Metadata = {
  title: "Przegląd partii — Gomoku",
  robots: { index: false, follow: false },
};

type ReviewPageProps = { params: Promise<{ gameId: string }> };

/**
 * `/games/[gameId]/review` (E09-S01): a finished game, move by move. E09-S02 reaches the same
 * screen with a code; until then only a participant with an account gets in (BR-44).
 */
export default async function ReviewPage({ params }: ReviewPageProps) {
  // Reads the session cookie and the database: rendered per request.
  await connection();
  const { gameId } = await params;
  // A malformed id is the same 404 as a missing game, and needs no session to say so.
  if (!gameIdSchema.safeParse(gameId).success) notFound();
  const session = await getCurrentUserWith((user, { gameReviewService }) =>
    gameReviewService.open({ kind: "account", userId: user.id }, gameId),
  );
  // Without an account there is no history (BR-24); signing in brings the visitor back here.
  if (!session) redirect(`/login?next=${encodeURIComponent(`/games/${gameId}/review`)}`);
  // One answer for a missing game, a removed one, a game still in play and somebody else's (N-05).
  if (!session.data) notFound();
  return <ReviewView review={session.data} back={{ href: "/history", label: "Wróć do historii" }} />;
}
