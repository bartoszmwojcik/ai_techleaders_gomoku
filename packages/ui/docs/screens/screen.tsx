import { Button } from "@gomoku/ui/game/button";
import { PageHeader } from "@gomoku/ui/game/page-header";
import { TextLink } from "@gomoku/ui/game/text-link";
import type { ReactNode } from "react";

// Frame of every player screen in the docs: header and a centred main area (layout-width-content).

export type Viewer = "guest" | "player" | "none";

function Header({ viewer }: { viewer: Viewer }) {
  if (viewer === "player") {
    return (
      <PageHeader
        brand="Gomoku"
        homeHref="#start"
        navigation={
          <>
            <TextLink href="#lobby" placement="standalone">Lobby</TextLink>
            <TextLink href="#historia" placement="standalone">Historia</TextLink>
          </>
        }
        navigationLabel="Główna nawigacja"
      >
        <TextLink href="#konto" placement="standalone">Konto</TextLink>
        <Button variant="secondary">Wyloguj</Button>
      </PageHeader>
    );
  }
  if (viewer === "none") {
    return (
      <PageHeader brand="Gomoku" homeHref="#start">
        <Button asChild><a href="#zaloguj">Zaloguj się</a></Button>
      </PageHeader>
    );
  }
  return <PageHeader brand="Gomoku" homeHref="#start" />;
}

export function Screen({ viewer = "none", children }: { viewer?: Viewer; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-surface-page text-text-primary">
      <Header viewer={viewer} />
      <main className="mx-auto flex max-w-(--layout-width-content) flex-col gap-section px-panel py-section">{children}</main>
    </div>
  );
}

export const screenParameters = { layout: "fullscreen" } as const;
