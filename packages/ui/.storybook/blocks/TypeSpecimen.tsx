const ROLES = [
  { role: "Tytuł strony", token: "text-title, font-strong", source: "R01.2", className: "text-title font-strong tracking-[var(--letter-spacing-title)]", sample: "Gomoku" },
  { role: "Nagłówek sekcji", token: "text-section, font-strong", source: "Q5, propozycja", className: "text-section font-strong", sample: "Lobby: szukają gry" },
  { role: "Nagłówek podsekcji", token: "text-subsection, font-strong", source: "Q5, propozycja", className: "text-subsection font-strong", sample: "Masz kod zaproszenia?" },
  { role: "Wprowadzenie", token: "text-lead, text-text-secondary", source: "R01.2", className: "text-lead text-text-secondary", sample: "Gra online 1:1. Pięć w linii wygrywa." },
  { role: "Tekst", token: "text-body", source: "propozycja", className: "text-body", sample: "Zaproszony może zagrać bez konta." },
  { role: "Etykieta", token: "text-meta, font-strong", source: "R01.2, propozycja", className: "text-meta font-strong", sample: "Kod zaproszenia" },
  { role: "Metadane", token: "text-meta, text-text-muted", source: "R01.2, R01.8", className: "text-meta text-text-muted", sample: "Swobodne zasady · plansza 15×15 · 10 minut na gracza" },
  { role: "Liczby (zegar)", token: "text-section, font-strong, tabular-nums", source: "propozycja", className: "text-section font-strong tabular-nums", sample: "09:41" },
  { role: "Kod zaproszenia", token: "text-section, font-strong, tracking-widest", source: "game-invitations (kod dużą czcionką), A01.4 (bez monospace)", className: "text-section font-strong tracking-widest", sample: "ABCD-EFGH" },
] as const;

export function TypeSpecimen() {
  return (
    <div className="flex flex-col gap-stack">
      {ROLES.map(({ role, token, source, className, sample }) => (
        <div className="border-b border-border-default pb-stack" key={role}>
          <p className="m-0 text-meta text-text-muted">
            {role} · <code>{token}</code> · źródło: {source}
          </p>
          <p className={`m-0 ${className}`}>{sample}</p>
        </div>
      ))}
    </div>
  );
}
