import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { StatusBadge } from "@gomoku/ui/game/status-badge";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useState } from "react";

import { go, Main, SiteHeader, useScreenEnter } from "../chrome";
import { logout, setNext, useSim, viewer, getSim } from "../sim";
import { ConfirmBanner } from "./banner";

export function S05Account() {
  const sim = useSim();
  const account = viewer(sim);
  const [asking, setAsking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // s05.6: no session means the login page, which brings the player back here afterwards (spec #20).
  useScreenEnter("s05", () => {
    if (!viewer(getSim())) {
      setNext("s05");
      go("s02");
    }
  });

  // s05.3: the button shows the wait. The session ends in this browser even when the server errs (s05.5, map L20).
  async function signOut() {
    setSigningOut(true);
    await logout();
    setSigningOut(false);
    setAsking(false);
    go("s04");
  }

  return (
    <>
      <SiteHeader />
      <Main>
        <h1 className="m-0 text-section font-strong">Konto</h1>
        {sim.scenario.loadingPages ? (
          // s05.9: loading state is not specified (map L18); skeletons hold the shape of the panel.
          <SkeletonRegion label="Ładowanie konta">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-6 w-80" />
            <Skeleton className="h-11 w-32" />
          </SkeletonRegion>
        ) : !account ? (
          <Alert status="info" title="Zaloguj się, aby zobaczyć konto">
            <TextLink href="#s02">Przejdź do logowania</TextLink>
          </Alert>
        ) : (
          <>
            <ConfirmBanner />
            <Panel title="Dane konta" className="max-w-xl">
              <p className="m-0 text-body">Nazwa gracza: <strong>{account.name}</strong></p>
              <p className="m-0 flex flex-wrap items-center gap-group text-body">
                E-mail: <strong>{account.email}</strong>
                <StatusBadge status={account.verified ? "success" : "warning"}>{account.verified ? "Potwierdzony" : "Niepotwierdzony"}</StatusBadge>
              </p>
              <div>
                <Button variant="secondary" loading={signingOut} onClick={() => (account.activeGame ? setAsking(true) : void signOut())}>Wyloguj</Button>
              </div>
            </Panel>
            <ConfirmDialog
              open={asking}
              onOpenChange={setAsking}
              tone="primary"
              title="Wylogować?"
              description="Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?"
              confirmLabel="Wyloguj"
              cancelLabel="Zostań zalogowany"
              confirming={signingOut}
              onConfirm={() => void signOut()}
            />
          </>
        )}
      </Main>
    </>
  );
}
