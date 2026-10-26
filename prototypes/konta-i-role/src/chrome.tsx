import { Button } from "@gomoku/ui/game/button";
import { Dialog } from "@gomoku/ui/game/dialog";
import { PageHeader } from "@gomoku/ui/game/page-header";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, type ReactNode } from "react";

import { showOutside, useSim, viewer } from "./sim";

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
export function OutsideLink({ name, children, placement }: { name: string; children: ReactNode; placement?: "inline" | "standalone" }) {
  return (
    <TextLink
      href={`#poza-${encodeURIComponent(name)}`}
      placement={placement}
      onClick={(event) => {
        event.preventDefault();
        showOutside(name);
      }}
    >
      {children}
    </TextLink>
  );
}

/** `submitForm`: on the login page the header button submits the login form (review comment on s02). */
export function SiteHeader({ submitForm }: { submitForm?: string } = {}) {
  const sim = useSim();
  const account = viewer(sim);
  if (!account) {
    return (
      <PageHeader brand="Gomoku" homeHref="#s04">
        {submitForm ? <Button type="submit" form={submitForm}>Zaloguj się</Button> : <Button asChild><a href="#s02">Zaloguj się</a></Button>}
      </PageHeader>
    );
  }
  // L06: only a confirmed player sees Lobby and Historia. L06 leaves "Wyloguj" in the header open (assumption A-07), so it lives on /account.
  return (
    <PageHeader
      brand="Gomoku"
      homeHref="#s04"
      navigation={
        account.verified ? (
          <>
            <OutsideLink name="Lobby" placement="standalone">Lobby</OutsideLink>
            <OutsideLink name="Historia partii" placement="standalone">Historia</OutsideLink>
          </>
        ) : undefined
      }
      navigationLabel={account.verified ? "Główna nawigacja" : undefined}
    >
      <span className="text-body text-text-secondary">Zalogowano jako {account.name}</span>
      <TextLink href="#s05" placement="standalone">Konto</TextLink>
    </PageHeader>
  );
}

export function Main({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <main className="mx-auto flex max-w-(--layout-width-content) flex-col gap-section px-panel py-section">
      <div className={narrow ? "flex max-w-sm flex-col gap-stack" : "flex flex-col gap-stack"}>{children}</div>
    </main>
  );
}

/** The dialog for places outside the prototype (Lobby, Historia, reset hasła, tworzenie zaproszenia). */
export function OutsideDialog() {
  const sim = useSim();
  return (
    <Dialog
      open={sim.outside !== null}
      onOpenChange={(open) => !open && showOutside(null)}
      title="Poza tym prototypem"
      description={`„${sim.outside ?? ""}” nie należy do przepływu kont (Epik 01). W prototypie ten przycisk nie działa.`}
      closeLabel="Zamknij"
    >
      <Button variant="secondary" onClick={() => showOutside(null)}>Wróć do prototypu</Button>
    </Dialog>
  );
}
