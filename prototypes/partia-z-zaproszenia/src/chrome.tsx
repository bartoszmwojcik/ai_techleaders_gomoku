import { Button } from "@gomoku/ui/game/button";
import { Dialog } from "@gomoku/ui/game/dialog";
import { PageHeader } from "@gomoku/ui/game/page-header";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useState, type ReactNode } from "react";

import { gameRoute, guestToken, showOutside, useSim, viewer, type GameScreenId, type OutsideKind } from "./sim";

declare global {
  interface Window {
    __PROTOTYPE_START__?: () => boolean;
  }
}

/** Moves to a screen of the prototype through the review engine (keeps its Back history). */
export const go = (screen: string) => document.dispatchEvent(new CustomEvent("prototype:navigate", { detail: screen }));

/** Runs `handler` whenever the review engine shows `screen`. */
export function useScreenEnter(screen: string, handler: () => void) {
  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<string>).detail === screen) handler();
    };
    document.addEventListener("prototype:screen-change", listener);
    return () => document.removeEventListener("prototype:screen-change", listener);
  });
}

/** The id of the screen the review engine shows now. */
export function useCurrentScreen(): string {
  const [current, setCurrent] = useState(() => document.querySelector(".screen.is-current")?.id ?? "");
  useEffect(() => {
    const listener = (event: Event) => setCurrent((event as CustomEvent<string>).detail);
    document.addEventListener("prototype:screen-change", listener);
    return () => document.removeEventListener("prototype:screen-change", listener);
  }, []);
  return current;
}

/** The game page lives on one of four screens (p03–p06) or is closed to the viewer; keeps the shown screen in line with the game. */
export function useGameRoute(screen: GameScreenId) {
  const sim = useSim();
  const current = useCurrentScreen();
  const route = gameRoute(sim);
  useEffect(() => {
    if (current === screen && route !== null && route !== screen) go(route);
  }, [current, screen, route]);
  return route;
}

/** One permanent screen section in the shape the review engine expects (README: umowa z markupem). */
export function ScreenSection({ id, title, meta, notes, children }: { id: string; title: string; meta: string; notes: ReactNode[]; children: ReactNode }) {
  return (
    <section className="screen" id={id}>
      <div className="screen-meta">
        <h2>{`${id} ${title}`}</h2>
        <p>{meta}</p>
      </div>
      <div className="frame">{children}</div>
      <div className="notes">
        {notes.map((note, index) => (
          <p key={index} className="note">{note}</p>
        ))}
      </div>
    </section>
  );
}

/** A link to a place that is outside this prototype: opens a dialog instead of a dead click (rule 6). */
export function OutsideLink({ name, kind = "other", children, placement }: { name: string; kind?: OutsideKind; children: ReactNode; placement?: "inline" | "standalone" }) {
  return (
    <TextLink
      href={`#poza-${encodeURIComponent(name)}`}
      placement={placement}
      onClick={(event) => {
        event.preventDefault();
        showOutside(name, kind);
      }}
    >
      {children}
    </TextLink>
  );
}

/** The header of every player page. Lobby, Historia and Konto are outside this prototype. */
export function SiteHeader() {
  const sim = useSim();
  const account = viewer(sim);
  if (account) {
    // BR-26: every signed-in player sees Lobby and Historia, with or without a confirmed e-mail.
    return (
      <PageHeader
        brand="Gomoku"
        homeHref="#p01"
        navigation={
          <>
            <OutsideLink name="Lobby" placement="standalone">Lobby</OutsideLink>
            <OutsideLink name="Historia partii" placement="standalone">Historia</OutsideLink>
          </>
        }
        navigationLabel="Główna nawigacja"
      >
        <span className="text-body text-text-secondary">Zalogowano jako {account.name}</span>
        <OutsideLink name="Konto" kind="account" placement="standalone">Konto</OutsideLink>
      </PageHeader>
    );
  }
  if (guestToken(sim) !== null) {
    // A guest has no account, no name and no history (BR-22, BR-24).
    return (
      <PageHeader brand="Gomoku" homeHref="#p01">
        <span className="text-body text-text-secondary">Gość (bez konta)</span>
      </PageHeader>
    );
  }
  return (
    <PageHeader brand="Gomoku" homeHref="#p01">
      <Button onClick={() => showOutside("Zaloguj się", "account")}>Zaloguj się</Button>
    </PageHeader>
  );
}

export function Main({ children, narrow = false, state }: { children: ReactNode; narrow?: boolean; state?: string }) {
  return (
    <main data-state={state} className="mx-auto flex max-w-(--layout-width-content) flex-col gap-section px-panel py-section">
      <div className={narrow ? "flex max-w-sm flex-col gap-stack" : "flex flex-col gap-stack"}>{children}</div>
    </main>
  );
}

const OUTSIDE_TEXT: Record<OutsideKind, (name: string) => string> = {
  account: (name) => `„${name}” należy do prototypu kont (Epik 01). Tu konto wybierasz w panelu „Scenariusze” (T1–T7); po zalogowaniu wrócisz na to samo zaproszenie.`,
  board: (name) => `„${name}” to inna partia, której ten prototyp nie pokazuje: symuluje jedną partię naraz (A-26). W produkcie ten link prowadzi do tamtej partii.`,
  other: (name) => `„${name}” nie należy do przepływu partii z zaproszenia (Lobby i historia to inne epiki). W prototypie ten przycisk nie działa.`,
};

/** The dialog for places outside the prototype (account, Lobby, Historia, the board). */
export function OutsideDialog() {
  const sim = useSim();
  const outside = sim.outside;
  return (
    <Dialog
      open={outside !== null}
      onOpenChange={(open) => !open && showOutside(null)}
      title="Poza tym prototypem"
      description={outside ? OUTSIDE_TEXT[outside.kind](outside.name) : ""}
      closeLabel="Zamknij"
    >
      <Button variant="secondary" onClick={() => showOutside(null)}>Wróć do prototypu</Button>
    </Dialog>
  );
}
