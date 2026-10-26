import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useState } from "react";

import { go, Main, OutsideLink, SiteHeader, useScreenEnter } from "../chrome";
import { joinAsGuest, setNext, showOutside, useSim, viewer, type InviteScenario } from "../sim";

// s07 Wejście z zaproszenia `/invite/[code]` (map s07, game-invitations #21). The inviter and the code are
// fictitious. A signed-in player never plays as a guest (BR-26, Q19 after the change).
const INVITER = "Marek_Z";

type Shown = "visitor" | "guest-warning" | "signed-in" | Exclude<InviteScenario, "auto">;

export function S07Invite() {
  const sim = useSim();
  const account = viewer(sim);
  const [asking, setAsking] = useState(false);

  // Every visit starts at the first choice; the guest warning opens only after "Graj jako gość".
  useScreenEnter("s07", () => setAsking(false));

  let shown: Shown;
  if (sim.invite !== "auto") shown = sim.invite;
  else if (sim.guestGame) shown = "other-game";
  else if (account) shown = "signed-in";
  else shown = asking ? "guest-warning" : "visitor";

  const logIn = () => {
    setNext("s07");
    go("s02");
  };
  const signUp = () => {
    setNext("s07");
    go("s01");
  };

  return (
    <>
      <SiteHeader />
      <Main narrow>
        <h1 className="m-0 text-section font-strong">{INVITER} zaprasza Cię do partii Gomoku</h1>
        <p className="m-0 text-meta text-text-muted">Kod zaproszenia: ABCD-EFGH (fikcyjny). Swobodne zasady · plansza 15×15 · 10 minut na gracza.</p>

        {shown === "visitor" && (
          <>
            <div className="flex flex-wrap gap-group">
              <Button onClick={logIn}>Zaloguj się</Button>
              <Button variant="secondary" onClick={signUp}>Załóż konto</Button>
              <Button variant="secondary" onClick={() => setAsking(true)}>Graj jako gość</Button>
            </div>
            <p className="m-0 text-meta text-text-muted">Konto zakładasz w minutę: e-mail, nazwa gracza i hasło co najmniej 8 znaków. Potwierdzenie e-maila możesz zrobić później.</p>
          </>
        )}

        {shown === "guest-warning" && (
          <>
            <Alert status="warning" title="Grasz bez konta">
              Nie zmieniaj przeglądarki w trakcie partii: stracisz do niej dostęp, a Twój zegar będzie biegł dalej. Gość nie ma nazwy ani historii.
            </Alert>
            <div className="flex flex-wrap gap-group">
              <Button
                onClick={() => {
                  joinAsGuest();
                  showOutside("Partia gościa");
                }}
              >
                Rozumiem, graj jako gość
              </Button>
              <Button variant="secondary" onClick={() => setAsking(false)}>Wróć</Button>
            </div>
          </>
        )}

        {shown === "signed-in" && (
          <div>
            <Button onClick={() => showOutside("Dołączenie do partii")}>Dołącz do partii</Button>
          </div>
        )}

        {(shown === "participant" || shown === "own") && (
          // s07.4, s07.5: in the product these are redirects to /games/{id}; the prototype shows the target instead.
          <>
            <Alert status="info" title={shown === "own" ? "To Twoje zaproszenie" : "Już jesteś w tej partii"}>
              W aplikacji przeniesiemy Cię od razu do partii.
            </Alert>
            <div><Button onClick={() => showOutside("Partia")}>Przejdź do partii</Button></div>
          </>
        )}

        {shown === "other-game" && (
          <>
            <Alert status="warning" title="Masz już partię">Możesz grać tylko jedną partię naraz.</Alert>
            <OutsideLink name="Twoja partia" placement="standalone">Wróć do swojej partii</OutsideLink>
          </>
        )}

        {shown === "waiting-game" && (
          <>
            <Alert status="warning" title="Masz oczekującą partię">Żeby dołączyć do tej, musisz najpierw anulować swoją.</Alert>
            <div><Button onClick={() => showOutside("Anulowanie oczekującej partii")}>Anuluj moją partię i dołącz</Button></div>
          </>
        )}

        {shown === "limit" && <Alert status="danger" title="Zbyt wiele prób">Spróbuj za chwilę.</Alert>}

        {shown === "invalid" && (
          <>
            <Alert status="danger" title="To zaproszenie jest już nieważne">Poproś znajomego o nowy link.</Alert>
            <TextLink href="#s04" placement="standalone">Wróć na stronę główną</TextLink>
          </>
        )}
      </Main>
    </>
  );
}
