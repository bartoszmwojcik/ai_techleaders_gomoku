import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";

import { Main, OutsideLink, SiteHeader } from "../chrome";
import { cellLabel, OPENING } from "../demo";
import { clearNotice, showOutside, useSim, viewer } from "../sim";
import { ConfirmBanner } from "./banner";

export function S04Home() {
  const sim = useSim();
  const account = viewer(sim);
  const unverified = account !== null && !account.verified;
  if (sim.scenario.loadingPages) {
    // s04.12: the spec has no loading state (map L18), so the shape of the page is held with skeletons.
    return (
      <>
        <SiteHeader />
        <Main>
          <SkeletonRegion label="Ładowanie strony głównej">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-6 w-full max-w-md" />
            <Skeleton className="h-11 w-56" />
          </SkeletonRegion>
        </Main>
      </>
    );
  }
  return (
    <>
      <SiteHeader />
      <Main>
        {sim.notice && !account && (
          <Alert status="warning" title="Wylogowano">
            {sim.notice} <Button variant="secondary" onClick={clearNotice}>Zamknij</Button>
          </Alert>
        )}
        {unverified && <ConfirmBanner />}
        <div className="flex flex-wrap items-center justify-center gap-section">
          <section className="flex max-w-(--layout-width-narrow) flex-1 basis-(--layout-width-narrow) flex-col gap-stack">
            <h1 className="m-0 text-title font-strong tracking-(--letter-spacing-title)">Gomoku</h1>
            <p className="m-0 text-lead text-text-secondary">
              Gra online 1:1. Pięć w linii wygrywa. Zagraj ze znajomym albo znajdź przeciwnika w lobby.
            </p>
            <p className="m-0 text-meta text-text-muted">Swobodne zasady · plansza 15×15 · 10 minut na gracza</p>
            <div className="flex flex-wrap gap-group">
              {!account && <Button asChild><a href="#s01">Załóż konto</a></Button>}
              {account && (
                <>
                  <Button disabled={unverified} aria-describedby="why-play" onClick={() => showOutside("Utwórz zaproszenie")}>Utwórz zaproszenie</Button>
                  <Button variant="secondary" disabled={unverified} aria-describedby="why-play" onClick={() => showOutside("Szukam przeciwnika")}>Szukam przeciwnika</Button>
                </>
              )}
            </div>
            {account && (
              <p id="why-play" className="m-0 text-meta text-text-muted">
                {unverified
                  ? "Potwierdź e-mail, aby tworzyć partie i wchodzić do lobby."
                  : <>Tworzenie partii i lobby są poza tym prototypem (Epik 02 i 03). <OutsideLink name="Lobby">Co to znaczy?</OutsideLink></>}
              </p>
            )}
          </section>
          <Board stones={OPENING} readOnly label="Podgląd planszy 15 na 15" cellLabel={cellLabel} />
        </div>
      </Main>
    </>
  );
}
