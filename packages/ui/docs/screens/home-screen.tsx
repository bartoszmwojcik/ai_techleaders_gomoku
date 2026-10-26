import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { VerifyEmailBanner } from "@gomoku/ui/game/verify-email-banner";

import { cellLabel, OPENING } from "../shared";
import { Screen } from "./screen";

// The home page `/` for each kind of visitor (login-logout, email-verification, game-invitations).
export type HomeState = "visitor" | "unconfirmed" | "confirmed";

const noop = () => undefined;

export function HomeScreen({ state }: { state: HomeState }) {
  const player = state !== "visitor";
  return (
    <Screen viewer={player ? "player" : "none"}>
      {state === "unconfirmed" && (
        <VerifyEmailBanner title="Potwierdź adres e-mail" resendLabel="Wyślij ponownie" dismissLabel="Zamknij" onDismiss={noop} onResend={noop}>
          Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła. Link wysyłamy na ala@example.com — sprawdź też folder spam.
        </VerifyEmailBanner>
      )}
      <div className="flex flex-wrap items-center justify-center gap-section">
        <section className="flex max-w-(--layout-width-narrow) flex-1 basis-(--layout-width-narrow) flex-col gap-stack">
          <h1 className="m-0 text-title font-strong tracking-(--letter-spacing-title)">Gomoku</h1>
          <p className="m-0 text-lead text-text-secondary">
            Gra online 1:1. Pięć w linii wygrywa. Zagraj ze znajomym albo znajdź przeciwnika w lobby.
          </p>
          <p className="m-0 text-meta text-text-muted">Swobodne zasady · plansza 15×15 · 10 minut na gracza</p>
          <div className="flex flex-wrap gap-group">
            {state === "visitor" && <Button asChild><a href="#rejestracja">Załóż konto</a></Button>}
            {player && (
              <>
                <Button>Utwórz zaproszenie</Button>
                <Button variant="secondary">Szukam przeciwnika</Button>
              </>
            )}
          </div>
          <p className="m-0 text-body text-text-secondary">
            Masz kod od znajomego? <TextLink href="#join">Mam kod zaproszenia</TextLink>
          </p>
        </section>
        <figure className="m-0 flex w-full max-w-(--layout-width-board) flex-1 basis-(--layout-width-narrow) flex-col gap-group">
          <Board label="Plansza 15 na 15" cellLabel={cellLabel} stones={OPENING} readOnly />
          <figcaption className="text-meta text-text-muted">Przykładowa pozycja.</figcaption>
        </figure>
      </div>
      {state === "visitor" && <Alert title="Zaproszony przez znajomego?">Otwórz jego link: możesz zagrać bez konta.</Alert>}
    </Screen>
  );
}
