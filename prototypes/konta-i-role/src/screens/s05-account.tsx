import { Alert } from "@gomoku/ui/game/alert";
import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { StatusBadge } from "@gomoku/ui/game/status-badge";
import { TextLink } from "@gomoku/ui/game/text-link";

import { go, Main, SiteHeader, useScreenEnter } from "../chrome";
import { setNext, useSim, viewer, getSim } from "../sim";
import { ConfirmBanner } from "./banner";
import { SignOutButton } from "./sign-out-button";

export function S05Account() {
  const sim = useSim();
  const account = viewer(sim);

  // s05.6: no session means the login page, which brings the player back here afterwards (spec #20).
  useScreenEnter("s05", () => {
    if (!viewer(getSim())) {
      setNext("s05");
      go("s02");
    }
  });

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
                <SignOutButton />
              </div>
            </Panel>
          </>
        )}
      </Main>
    </>
  );
}
