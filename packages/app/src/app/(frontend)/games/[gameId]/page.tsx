import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { loadGameView } from "@/server/http/game-view";
import { loadSpectatorView } from "@/server/http/spectator-view";

import { GameRoom } from "./game-room";
import { AudienceClosedScreen } from "@/components/games/audience-closed";
import { SpectatorRoom } from "./spectator-room";

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
  if (!game) {
    // Not a player: perhaps a spectator of a public game (E10-S02). Anybody else gets the same 404.
    const watched = await loadSpectatorView(gameId);
    if (!watched) notFound();
    if (watched === "closed") return <AudienceClosedScreen />;
    return <SpectatorRoom gameId={gameId} initial={watched} />;
  }
  // Only the first `notice` counts; the only known one is the redirect from a second "create" (L01).
  const ownWaiting = (Array.isArray(notice) ? notice[0] : notice) === "own-waiting";
  return <GameRoom gameId={gameId} initial={game} ownWaitingNotice={ownWaiting} />;
}
