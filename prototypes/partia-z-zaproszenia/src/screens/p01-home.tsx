import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { VerifyEmailBanner } from "@gomoku/ui/game/verify-email-banner";
import { useEffect, useState } from "react";

import { go, Main, OutsideLink, SiteHeader, useScreenEnter } from "../chrome";
import { cellLabel, OPENING } from "../demo";
import {
  createGame,
  guestToken,
  liveGame,
  phaseOf,
  screenForGame,
  setNotice,
  showOutside,
  useSim,
  viewer,
  type CreateResult,
  type Game,
  type Sim,
} from "../sim";
import { useStateId } from "../stateId";

// p01 Utworzenie partii: the "Utwórz zaproszenie" action on the home page `/` (map p01.1–p01.7, game-invitations #21).

type Failure = Extract<CreateResult, { kind: "active" | "limit" | "server" | "network" }>;

/** Opens the page of a game the player already has (BR-13): its board when it is in progress. */
export function openGame(sim: Sim, game: Game) {
  go(screenForGame(sim, game));
}

const PHASE_TEXT = { waiting: "Czeka na przeciwnika.", ready: "Gotowa do gry.", playing: "W toku." } as const;

export function P01Home() {
  const sim = useSim();
  const account = viewer(sim);
  const guest = guestToken(sim) !== null;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const live = liveGame(sim);

  // The result of one try is not carried over to another identity or to a reset.
  useEffect(() => setFailure(null), [sim.role, sim.epoch]);
  useScreenEnter("p01", () => setFailure(null));

  async function onCreate() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    const result = await createGame();
    setBusy(false);
    if (result.kind === "ok") go("p03");
    else if (result.kind === "waiting") {
      // L01: the player already has a waiting game, so we take them to it and say so.
      setNotice({ text: "Masz już oczekującą partię.", screen: "p03" });
      go("p03");
    } else setFailure(result);
  }

  let stateId = "p01.1";
  if (busy) stateId = "p01.2";
  else if (failure?.kind === "active") stateId = "p01.3";
  else if (failure?.kind === "limit") stateId = "p01.5";
  else if (failure?.kind === "server") stateId = "p01.6";
  else if (failure?.kind === "network") stateId = "p01.7";
  useStateId("p01", stateId);

  const notice = sim.notice?.screen === "p01" ? sim.notice : null;

  return (
    <>
      <SiteHeader />
      <Main state={stateId}>
        {notice && (
          <Alert status="info" title="Zaproszenie anulowane">
            {notice.text} <Button variant="secondary" onClick={() => setNotice(null)}>Zamknij</Button>
          </Alert>
        )}
        {account && !account.verified && (
          // BR-26: an unconfirmed e-mail blocks nothing; the banner only explains why to confirm.
          <VerifyEmailBanner
            title="Potwierdź adres e-mail"
            resendLabel="Wyślij ponownie"
            dismissLabel="Zamknij"
            onDismiss={() => showOutside("Zamknięcie banera", "account")}
            onResend={() => showOutside("Wyślij ponownie", "account")}
          >
            Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła. Link wysyłamy na {account.email} — sprawdź też folder spam.
          </VerifyEmailBanner>
        )}
        <div className="flex flex-wrap items-center justify-center gap-section">
          <section className="flex max-w-(--layout-width-narrow) flex-1 basis-(--layout-width-narrow) flex-col gap-stack">
            <h1 className="m-0 text-title font-strong tracking-(--letter-spacing-title)">Gomoku</h1>
            <p className="m-0 text-lead text-text-secondary">
              {guest
                ? "Grasz bez konta. Zaproszenia tworzą tylko zalogowani gracze."
                : account
                  ? "Zaproś znajomego do partii: wyślij mu link albo podyktuj kod."
                  : "Zagraj w Gomoku z bliską osobą. Załóż konto, żeby tworzyć zaproszenia, albo wpisz kod od znajomego."}
            </p>
            <p className="m-0 text-meta text-text-muted">Swobodne zasady · plansza 15×15 · 10 minut na gracza</p>
            {live && (
              <Alert status="info" title="Masz partię">
                {PHASE_TEXT[phaseOf(sim, live) as keyof typeof PHASE_TEXT]}{" "}
                <TextLink
                  href="#wroc-do-partii"
                  onClick={(event) => {
                    event.preventDefault();
                    openGame(sim, live);
                  }}
                >
                  Wróć do partii
                </TextLink>
              </Alert>
            )}
            {failure?.kind === "active" && (
              <Alert status="warning" title="Masz już partię">
                Najpierw dokończ bieżącą partię.{" "}
                <TextLink
                  href="#przejdz-do-partii"
                  onClick={(event) => {
                    event.preventDefault();
                    if (live) openGame(sim, live);
                    else showOutside("Partia w toku: plansza", "board");
                  }}
                >
                  Przejdź do partii
                </TextLink>
              </Alert>
            )}
            {failure?.kind === "limit" && (
              <Alert status="danger" title="Zbyt wiele zaproszeń">
                Limit to 10 utworzeń na godzinę. Spróbuj ponownie za {failure.minutes} min.
              </Alert>
            )}
            {(failure?.kind === "server" || failure?.kind === "network") && (
              <Alert status="danger" title={failure.kind === "server" ? "Nie udało się utworzyć partii" : "Brak połączenia"}>
                {failure.kind === "server" ? "Błąd po stronie serwera. Spróbuj ponownie." : "Nie udało się połączyć z serwerem. Spróbuj ponownie."}
                <div className="mt-group">
                  <Button variant="secondary" onClick={onCreate}>Spróbuj ponownie</Button>
                </div>
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-group">
              {account && <Button loading={busy} onClick={onCreate}>{busy ? "Tworzenie zaproszenia…" : "Utwórz zaproszenie"}</Button>}
              {!account && !guest && <Button onClick={() => showOutside("Załóż konto", "account")}>Załóż konto</Button>}
              <TextLink href="#p02" placement="standalone">Masz kod?</TextLink>
            </div>
            {account && (
              <p className="m-0 text-meta text-text-muted">
                Szukanie przeciwnika w lobby jest poza tym prototypem. <OutsideLink name="Lobby">Co to znaczy?</OutsideLink>
              </p>
            )}
          </section>
          <Board stones={OPENING} readOnly label="Podgląd planszy 15 na 15" cellLabel={cellLabel} />
        </div>
      </Main>
    </>
  );
}
