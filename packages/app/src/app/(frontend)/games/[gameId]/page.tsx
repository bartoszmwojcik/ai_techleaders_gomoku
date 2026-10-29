import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { loadGameView } from "@/server/http/game-view";

import { GameRoom } from "./game-room";

export const metadata: Metadata = {
  title: "Partia — Gomoku",
  robots: { index: false, follow: false },
};

type GamePageProps = {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
};

export default async function GamePage({ params, searchParams }: GamePageProps) {
  // Reads the session and guest cookies and marks the visit (`seen_at`): rendered per request.
  await connection();
  const { gameId } = await params;
  const { notice } = await searchParams;
  const game = await loadGameView(gameId);
  if (!game) notFound();
  // Only the first `notice` counts; the only known one is the redirect from a second "create" (L01).
  const ownWaiting = (Array.isArray(notice) ? notice[0] : notice) === "own-waiting";
  return <GameRoom gameId={gameId} initial={game} ownWaitingNotice={ownWaiting} />;
}
