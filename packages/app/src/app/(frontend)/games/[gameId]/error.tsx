"use client";

import { Button } from "@gomoku/ui/game/button";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { TextLink } from "@gomoku/ui/game/text-link";

// p07.4: the database does not answer (or anything else broke while reading the game).
// `retry` (Next 16) re-fetches the server component; `reset` would only re-render the failed output.
export default function GameError({ retry }: { error: Error; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <ErrorState
        title="Nie udało się połączyć z serwerem. Spróbuj ponownie."
        action={
          <div className="flex flex-wrap items-center gap-group">
            <Button onClick={retry}>Spróbuj ponownie</Button>
            <TextLink href="/" placement="standalone">
              Wróć na stronę główną
            </TextLink>
          </div>
        }
      >
        Nie wiemy, czy ta partia istnieje: serwer nie odpowiada.
      </ErrorState>
    </main>
  );
}
