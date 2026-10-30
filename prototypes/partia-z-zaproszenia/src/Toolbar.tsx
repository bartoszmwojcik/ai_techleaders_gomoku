import { useState } from "react";

import { Scenarios } from "./Scenarios";
import { formatNow, playerName, tokenOf, useSim, viewer } from "./sim";
import { useCurrentStateId } from "./stateId";

export const SCREENS = [
  { id: "p01", title: "Utworzenie partii" },
  { id: "p02", title: "Kod zaproszenia" },
  { id: "s07", title: "Zaproszenie" },
  { id: "p03", title: "Czekamy na przeciwnika" },
  { id: "p04", title: "Partia gotowa" },
  { id: "p05", title: "Partia w toku" },
  { id: "p06", title: "Koniec partii" },
  { id: "p07", title: "Brak dostępu i błędy" },
  { id: "p08", title: "Gość tworzy partię" },
] as const;

/** The review bar: screen picker, theme and the "Prototyp" mark. The engine adds its own buttons to it. */
export function Toolbar() {
  const sim = useSim();
  const account = viewer(sim);
  const stateId = useCurrentStateId();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const who = account
    ? `${account.name} (${account.verified ? "e-mail potwierdzony" : "e-mail niepotwierdzony"})`
    : tokenOf(sim) !== null
      ? `gość „${(() => { const t = tokenOf(sim)!; const g = sim.games.find((x) => x.id === t.game); return g ? playerName(g, t.side).label : "gość"; })()}”`
      : "niezalogowany";
  return (
    <header className="doc-toolbar" aria-label="Pasek przeglądu prototypu">
      <span className="proto-tag">Prototyp</span>
      <span>Symulacja, dane fikcyjne. Teraz: {formatNow(sim)}. Sesja: {who}.</span>
      <span data-testid="state-id">Stan: {stateId || "-"}</span>
      <nav className="screen-nav" aria-label="Ekrany prototypu">
        {SCREENS.map((screen) => (
          <a key={screen.id} href={`#${screen.id}`}>{`${screen.id} ${screen.title}`}</a>
        ))}
      </nav>
      <button
        id="theme-toggle"
        type="button"
        className="btn btn-outline btn-sm"
        aria-pressed={theme === "light"}
        onClick={() => {
          const next = theme === "dark" ? "light" : "dark";
          setTheme(next);
          document.documentElement.dataset.theme = next;
        }}
      >
        {theme === "dark" ? "Motyw: ciemny" : "Motyw: jasny"}
      </button>
      <Scenarios />
    </header>
  );
}
