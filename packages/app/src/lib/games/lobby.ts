import type { LobbySeekerView } from "@gomoku/core/games/lobby";

/** What `GET /api/lobby` answers, as the page keeps it (`createdAt` of the own status is not needed). */
export type LobbyData = {
  me: { id: string; expiresInMs: number } | null;
  currentGame: { gameId: string; status: "waiting" | "active" } | null;
  seekers: LobbySeekerView[];
};

/** "szuka od 3 min"; under a minute there is no number to round. */
export function sinceLabel(sinceMs: number): string {
  const minutes = Math.floor(sinceMs / 60_000);
  return minutes < 1 ? "szuka od chwili" : `szuka od ${minutes} min`;
}
