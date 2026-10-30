import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import { Panel } from "@gomoku/ui/game/panel";
import { StatusBadge } from "@gomoku/ui/game/status-badge";

import { Main, SiteHeader } from "../chrome";
import { cellLabel, OPENING } from "../demo";
import { useSim } from "../sim";

/**
 * s08 /games/{id} as the opponent sees a finished game after the other player deleted the account (spec #37, Q1, "Edge Cases").
 * This is a stand-in for p06 of the game prototype (partia-z-zaproszenia), which has no deleted player yet; only the parts
 * that change are drawn. The "Rewanż niedostępny" notice is an owner decision of 2026-10-30; a pending rematch offer is closed silently (no alert). The header shows the viewer of this screen, not the demo session.
 */
export function S08Opponent() {
  const sim = useSim();
  const deleted = sim.opponentDeleted;
  const guest = sim.scenario.opponentIsGuest;
  const me = guest ? "Piotr (gość)" : "Olek_R";
  const other = deleted ? "Usunięty gracz" : "Marek_Z";

  return (
    <>
      <SiteHeader asViewer={guest ? null : me} />
      <Main>
        <h1 className="m-0 text-section font-strong">Partia zakończona</h1>
        <GameResultBanner result="win" title="Wygrałeś">
          Przeciwnik poddał się.
        </GameResultBanner>
        <Panel title="Gracze" className="max-w-xl">
          <ul className="m-0 flex list-none flex-col gap-group p-0 text-body">
            <li className="flex flex-wrap items-center gap-group">
              Czarne: <strong>Ty ({me})</strong> <StatusBadge status="success">Wygrana</StatusBadge>
            </li>
            <li className="flex flex-wrap items-center gap-group" data-testid="opponent-name">
              Białe: <strong>{other}</strong> <StatusBadge status="danger">Przegrana</StatusBadge>
            </li>
          </ul>
          {deleted && (
            <p className="m-0 text-meta text-text-muted" data-testid="deleted-player-hint">
              Ten gracz usunął konto. Wynik i przebieg partii zostają bez zmian.
            </p>
          )}
        </Panel>
        {deleted && sim.scenario.rematchNotice && (
          <Alert status="info" title="Rewanż niedostępny" role="status">
            Ten gracz nie ma już konta, więc nie możesz zaproponować rewanżu.
          </Alert>
        )}
        {!deleted && (
          // With an existing opponent the rematch block of p06 is there; here it is only named, not drawn.
          <p className="m-0 text-meta text-text-muted">Rewanż: blok z ekranu p06 prototypu partii (poza tym ekranem).</p>
        )}
        <Board stones={OPENING} readOnly label="Końcowa pozycja partii, 15 na 15" cellLabel={cellLabel} />
      </Main>
    </>
  );
}
