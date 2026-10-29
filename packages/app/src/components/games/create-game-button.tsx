"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import { apiCall } from "@/lib/api-client";

/** The game the player already holds a slot in (from the server, `GameParticipation.currentGame`). */
export type HeldGame = { gameId: string; status: "waiting" | "active" };

type Failure =
  | { kind: "active" }
  | { kind: "limit"; retryAfterSeconds: number | undefined }
  | { kind: "signed-out" }
  | { kind: "server" }
  | { kind: "network" };

/** "Utwórz zaproszenie" (p01): creates a waiting game and opens its page. */
export function CreateGameButton({ heldGame }: { heldGame: HeldGame | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function onCreate() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await apiCall<{ gameId: string }>("/api/games");
    if (result.ok) {
      // Stay busy while the page navigates, so a second game cannot be created.
      router.push(`/games/${result.data.gameId}`);
      return;
    }
    const { code, retryAfterSeconds } = result.error;
    if (code === "ACTIVE_GAME_EXISTS" && heldGame?.status === "waiting") {
      // L01: the player already waits in a game of their own, so we take them there and say so.
      router.push(`/games/${heldGame.gameId}?notice=own-waiting`);
      return;
    }
    setBusy(false);
    if (code === "ACTIVE_GAME_EXISTS") setFailure({ kind: "active" });
    else if (code === "RATE_LIMITED") setFailure({ kind: "limit", retryAfterSeconds });
    else if (code === "UNAUTHORIZED") setFailure({ kind: "signed-out" });
    else if (code === "network") setFailure({ kind: "network" });
    else setFailure({ kind: "server" });
  }

  const retry = (
    <div className="mt-group">
      <Button variant="secondary" onClick={() => void onCreate()}>
        Spróbuj ponownie
      </Button>
    </div>
  );

  return (
    <>
      {failure?.kind === "active" && (
        <Alert status="warning" title="Masz już partię" role="alert">
          Najpierw dokończ bieżącą partię.{" "}
          {heldGame && <TextLink href={`/games/${heldGame.gameId}`}>Przejdź do partii</TextLink>}
        </Alert>
      )}
      {failure?.kind === "limit" && (
        <Alert status="danger" title="Zbyt wiele zaproszeń">
          Limit to 10 utworzeń na godzinę. {rateLimitedError(failure.retryAfterSeconds).details}
        </Alert>
      )}
      {failure?.kind === "signed-out" && (
        <Alert status="warning" title="Sesja wygasła">
          <TextLink href="/login?next=%2F">Zaloguj się ponownie</TextLink>, żeby utworzyć zaproszenie.
        </Alert>
      )}
      {failure?.kind === "server" && (
        <Alert status="danger" title="Nie udało się utworzyć partii">
          Błąd po stronie serwera. Spróbuj ponownie.
          {retry}
        </Alert>
      )}
      {failure?.kind === "network" && (
        <Alert status="danger" title="Brak połączenia">
          Nie udało się połączyć z serwerem. Spróbuj ponownie.
          {retry}
        </Alert>
      )}
      <Button loading={busy} onClick={() => void onCreate()}>
        {busy ? "Tworzenie zaproszenia…" : "Utwórz zaproszenie"}
      </Button>
    </>
  );
}
