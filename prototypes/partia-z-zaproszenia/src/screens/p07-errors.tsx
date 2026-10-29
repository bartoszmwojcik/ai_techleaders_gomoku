import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";

import { go, Main, SiteHeader } from "../chrome";
import { gameRoute, useSim } from "../sim";
import { useStateId } from "../stateId";
import { GameGate, gateStateId, useGameBlock } from "./game-gate";

// p07 Brak dostępu i błędy `/games/{id}` as a screen of its own (map p07.1–p07.4): what the game page shows when it
// cannot show the game. The other game screens use the same `GameGate`; this one lets a reviewer open it directly.
export function P07Errors() {
  const sim = useSim();
  const route = gameRoute(sim);
  const block = useGameBlock("p07", null);
  const hasGame = route !== null && block === "gate";
  useStateId("p07", hasGame ? "p07" : gateStateId(sim, block === "none" ? "gate" : block));

  if (hasGame) {
    return (
      <>
        <SiteHeader />
        <Main narrow state="p07">
          <h1 className="m-0 text-section font-strong">Masz dostęp do tej partii</h1>
          <Alert status="info" title="Ten ekran pokazuje błędy dostępu">
            Wybierz T6 lub T7 w panelu „Scenariusze”, włącz „Baza niedostępna” albo „Wolne ładowanie partii”, żeby zobaczyć p07.1–p07.4.
          </Alert>
          <div><Button onClick={() => go(route)}>Przejdź do partii</Button></div>
        </Main>
      </>
    );
  }
  return <GameGate kind={block === "none" ? "gate" : block} />;
}
