"use client";

import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { useRef, useState } from "react";

import { apiCall } from "@/lib/api-client";
import type { GameView } from "@/server/http/game-view";

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";
const UNKNOWN_ERROR = "Nie udało się zamknąć publiczności. Spróbuj ponownie.";
const NOT_CLOSABLE_ERROR = "Publiczności nie można już zamknąć. Stan partii został odświeżony.";

type Props = {
  gameId: string;
  game: Pick<GameView, "canCloseAudience" | "audienceClosed">;
  /** The state the server answered with (`after` 0: all moves). */
  onState: (next: GameView, after: number) => void;
  onRefresh: () => void;
  /** The game is gone for this visitor (`404`). */
  onGone: () => void;
};

/**
 * The kill-switch of the creator of a public game (E10-S05, BR-43) and the note both players see
 * afterwards. Nothing for a game that was never public. Closing is one way: there is no reopening,
 * so the dialog says what happens. A repeat is harmless on the server, so "Spróbuj ponownie" may resend.
 */
export function CloseAudience({ gameId, game, onState, onRefresh, onGone }: Props) {
  // State alone lags a double click by one render; the ref closes that gap.
  const inFlight = useRef(false);
  const [asking, setAsking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    if (inFlight.current) return;
    inFlight.current = true;
    setClosing(true);
    setError(null);
    const result = await apiCall<GameView>(`/api/games/${gameId}/audience/close`);
    inFlight.current = false;
    setClosing(false);
    if (result.ok) {
      setAsking(false);
      onState(result.data, 0);
      return;
    }
    const { code } = result.error;
    if (code === "NOT_FOUND") {
      setAsking(false);
      onGone();
    } else if (code === "GAME_NOT_ACTIVE" || code === "GAME_NOT_PUBLIC") {
      setError(NOT_CLOSABLE_ERROR);
      onRefresh();
    } else {
      setError(code === "network" ? NETWORK_ERROR : UNKNOWN_ERROR);
    }
  }

  if (game.audienceClosed) {
    return (
      <p role="status" className="m-0 text-meta text-text-secondary" data-testid="audience-closed-note">
        Publiczność zamknięta przez twórcę — partia jest prywatna.
      </p>
    );
  }
  if (!game.canCloseAudience) return null;
  return (
    <div>
      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => {
          if (closing) return;
          setError(null);
          setAsking(open);
        }}
        trigger={
          <Button variant="secondary" data-testid="close-audience">
            Zamknij publiczność
          </Button>
        }
        title="Zamknąć publiczność?"
        description={
          <>
            {error && (
              <span role="alert" className="mb-group block font-strong text-status-danger">
                {error}
              </span>
            )}
            Widzowie zostaną od razu odłączeni, a kod i link przestaną otwierać oglądanie i przegląd partii. Nie da się tego cofnąć.
          </>
        }
        confirmLabel={closing ? "Zamykanie…" : error ? "Spróbuj ponownie" : "Zamknij publiczność"}
        cancelLabel="Zostaw publiczność"
        confirming={closing}
        onConfirm={() => void close()}
      />
    </div>
  );
}
