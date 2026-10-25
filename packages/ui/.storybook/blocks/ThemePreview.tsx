import { THEMES } from "../theme";
import { Swatch } from "./Swatch";

const SWATCHES = ["surface-page", "surface-raised", "text-primary", "text-secondary", "text-muted", "text-accent", "action-primary-bg", "status-danger"] as const;

const LABEL = { dark: "Ciemny (domyślny)", light: "Jasny" } as const;

export function ThemePreview() {
  return (
    <div className="flex flex-wrap gap-stack">
      {THEMES.map((theme) => (
        <section
          key={theme}
          data-theme={theme}
          aria-label={`Podgląd motywu: ${LABEL[theme]}`}
          className="flex-1 basis-[min(100%,var(--layout-width-narrow))] rounded-base border border-border-default bg-surface-page p-panel text-text-primary"
        >
          <h3 className="m-0 mb-stack text-subsection font-strong">{LABEL[theme]}</h3>
          <p className="m-0 mb-group text-lead text-text-secondary">Pięć w linii wygrywa.</p>
          <p className="m-0 mb-stack text-meta text-text-muted">Swobodne zasady · plansza 15×15 · 10 minut na gracza</p>
          <ul className="m-0 flex list-none flex-wrap gap-group p-0 text-meta">
            {SWATCHES.map((token) => (
              <li className="flex items-center gap-group" key={token}>
                <Swatch token={token} />
                <code>{token}</code>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
