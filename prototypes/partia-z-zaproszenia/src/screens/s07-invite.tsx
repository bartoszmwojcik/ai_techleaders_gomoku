import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useState } from "react";

import { go, Main, SiteHeader, useScreenEnter } from "../chrome";
import {
  acceptInvite,
  defaultInviteCode,
  findByCode,
  getSim,
  inviteView,
  liveGame,
  nameOf,
  openInvite,
  prepareDemoInvitation,
  screenForGame,
  showOutside,
  useSim,
  type InviteView,
} from "../sim";
import { useStateId } from "../stateId";
import { openGame } from "./p01-home";

// s07 Wejście z zaproszenia `/invite/[code]` (map s07.1–s07.9 from the Epik 01 map, game-invitations #21 UI).
// The page opens the link only: nothing is used up until the player presses a button (Q12).

const STATE_OF: Record<InviteView, string> = {
  visitor: "s07.1",
  "signed-in": "s07.3",
  participant: "s07.4",
  own: "s07.5",
  "other-game": "s07.6",
  "waiting-game": "s07.7",
  limit: "s07.8",
  invalid: "s07.9",
};

export function S07Invite() {
  const sim = useSim();
  const [asking, setAsking] = useState(false);
  const [joining, setJoining] = useState<"user" | "guest" | "cancel" | null>(null);

  // Every visit starts at the first choice; the guest warning opens only after "Graj jako gość".
  useScreenEnter("s07", () => {
    setAsking(false);
    let current = getSim();
    if (current.inviteCode === null) {
      // Opened from the review bar without a link: show Ala_7's demo invitation (a prototype shortcut).
      prepareDemoInvitation();
      openInvite(defaultInviteCode(getSim()));
      current = getSim();
    }
    // s07.4 and s07.5 are redirects to the game in the product.
    const view = inviteView(current);
    if (view === "own" || view === "participant") {
      const game = findByCode(current, current.inviteCode);
      if (game) go(screenForGame(current, game));
    }
  });

  const view = inviteView(sim);
  const game = findByCode(sim, sim.inviteCode);
  const stateId = view === "visitor" && asking ? "s07.2" : STATE_OF[view];
  useStateId("s07", stateId);

  async function join(as: "user" | "guest", cancelOwn = false) {
    if (joining) return;
    setJoining(cancelOwn ? "cancel" : as);
    const result = await acceptInvite(as, cancelOwn);
    setJoining(null);
    if (result.kind === "ok") go("p04");
  }

  const mine = liveGame(sim);
  const heading = view === "invalid" ? "To zaproszenie jest już nieważne" : view === "limit" ? "Zaproszenie do partii" : `${game ? nameOf(game.creator) : "Ala_7"} zaprasza Cię do partii Gomoku`;

  return (
    <>
      <SiteHeader />
      <Main narrow state={stateId}>
        <h1 className="m-0 text-section font-strong">{heading}</h1>
        {view !== "invalid" && view !== "limit" && (
          <p className="m-0 text-meta text-text-muted">Kod zaproszenia: {sim.inviteCode} (fikcyjny). Swobodne zasady · plansza 15×15 · 10 minut na gracza.</p>
        )}

        {view === "visitor" && !asking && (
          <>
            <div className="flex flex-wrap gap-group">
              <Button onClick={() => showOutside("Zaloguj się", "account")}>Zaloguj się</Button>
              <Button variant="secondary" onClick={() => showOutside("Załóż konto", "account")}>Załóż konto</Button>
              <Button variant="secondary" onClick={() => setAsking(true)}>Graj jako gość</Button>
            </div>
            <p className="m-0 text-meta text-text-muted">Konto zakładasz w minutę: e-mail, nazwa gracza i hasło co najmniej 8 znaków. Potwierdzenie e-maila możesz zrobić później.</p>
          </>
        )}

        {view === "visitor" && asking && (
          <>
            <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
              Stracisz do niej dostęp, a Twój zegar będzie biegł dalej. Gość nie ma nazwy ani historii.
            </Alert>
            <div className="flex flex-wrap gap-group">
              <Button loading={joining === "guest"} onClick={() => join("guest")}>{joining === "guest" ? "Dołączanie…" : "Rozumiem, graj jako gość"}</Button>
              <Button variant="secondary" disabled={joining !== null} onClick={() => setAsking(false)}>Wróć</Button>
            </div>
          </>
        )}

        {view === "signed-in" && (
          <div>
            <Button loading={joining === "user"} onClick={() => join("user")}>{joining === "user" ? "Dołączanie…" : "Dołącz do partii"}</Button>
          </div>
        )}

        {(view === "participant" || view === "own") && (
          // In the product this is a redirect to /games/{id} (s07.4, s07.5); the fallback is for a screen opened directly.
          <>
            <Alert status="info" title={view === "own" ? "To Twoje zaproszenie" : "Już jesteś w tej partii"}>
              W aplikacji przeniesiemy Cię od razu do partii.
            </Alert>
            <div>
              <Button
                onClick={() => {
                  if (game) openGame(sim, game);
                }}
              >
                Przejdź do partii
              </Button>
            </div>
          </>
        )}

        {view === "other-game" && (
          <>
            <Alert status="warning" title="Masz już partię">Możesz grać tylko jedną partię naraz. Dokończ ją, zanim dołączysz do kolejnej.</Alert>
            <TextLink
              href="#twoja-partia"
              placement="standalone"
              onClick={(event) => {
                event.preventDefault();
                if (mine) openGame(sim, mine);
                else showOutside("Partia w toku: plansza", "board");
              }}
            >
              Wróć do swojej partii
            </TextLink>
          </>
        )}

        {view === "waiting-game" && (
          <>
            <Alert status="warning" title="Masz oczekującą partię">Żeby dołączyć do tej, musisz najpierw anulować swoją.</Alert>
            <div>
              <Button loading={joining === "cancel"} onClick={() => join("user", true)}>{joining === "cancel" ? "Dołączanie…" : "Anuluj moją partię i dołącz"}</Button>
            </div>
          </>
        )}

        {view === "limit" && <Alert status="danger" title="Zbyt wiele prób — spróbuj za chwilę">Sprawdź kod albo wróć później.</Alert>}

        {view === "invalid" && (
          <>
            <Alert status="danger" title="Zaproszenie nie działa">Użyte, wygasłe albo anulowane. Poproś o nowe zaproszenie albo wpisz inny kod.</Alert>
            <div className="flex flex-wrap items-center gap-group">
              <Button variant="secondary" asChild><a href="#p02">Masz kod?</a></Button>
              <TextLink href="#p01" placement="standalone">Wróć na stronę główną</TextLink>
            </div>
          </>
        )}
      </Main>
    </>
  );
}
