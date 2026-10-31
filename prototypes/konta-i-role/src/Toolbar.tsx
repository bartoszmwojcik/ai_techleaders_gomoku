import { useState } from "react";

import { Scenarios } from "./Scenarios";
import { formatNow, useSim, viewer } from "./sim";

export const SCREENS = [
  { id: "s01", title: "Rejestracja" },
  { id: "s02", title: "Logowanie" },
  { id: "s03", title: "Potwierdzenie e-maila" },
  { id: "s04", title: "Strona główna" },
  { id: "s05", title: "Konto" },
  { id: "s06", title: "Skrzynka demo" },
  { id: "s07", title: "Zaproszenie" },
  { id: "s08", title: "Partia: widok przeciwnika" },
] as const;

/** The review bar: screen picker, theme and the "Prototyp" mark. The engine adds its own buttons to it. */
export function Toolbar() {
  const sim = useSim();
  const account = viewer(sim);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const who = account ? `${account.name} (${account.verified ? "e-mail potwierdzony" : "e-mail niepotwierdzony"})` : sim.guestGame ? "gość w partii" : "niezalogowany";
  return (
    <header className="doc-toolbar" aria-label="Pasek przeglądu prototypu">
      <span className="proto-tag">Prototyp</span>
      <span>Symulacja, dane fikcyjne. Teraz: {formatNow(sim)}. Sesja: {who}.</span>
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
