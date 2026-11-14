import type { LobbySeekerView } from "@gomoku/core/games/lobby";

import plLobby from "@/i18n/catalogs/pl/lobby";
import { textsOf, type TranslatorOf } from "@/i18n/client";

/** What `GET /api/lobby` answers, as the page keeps it (`createdAt` of the own status is not needed). */
export type LobbyData = {
  me: { id: string; expiresInMs: number } | null;
  currentGame: { gameId: string; status: "waiting" | "active" } | null;
  seekers: LobbySeekerView[];
};

export type LobbyTranslator = TranslatorOf<"lobby">;

const PL_LOBBY: LobbyTranslator = textsOf<"lobby">(plLobby);

/** "szuka od 3 min"; under a minute there is no number to round. */
export function sinceLabel(sinceMs: number, t: LobbyTranslator = PL_LOBBY): string {
  const minutes = Math.floor(sinceMs / 60_000);
  return minutes < 1 ? t("sinceNow") : t("sinceMinutes", { minutes: t.number(minutes) });
}
