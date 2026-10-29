import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { PlayerClock } from "@gomoku/ui/game/player-clock";
import { TextLink } from "@gomoku/ui/game/text-link";
import { TurnStatus } from "@gomoku/ui/game/turn-status";

import { go, Main, SiteHeader, useGameRoute } from "../chrome";
import { accessibleGame, nameOf, opponentName, phaseOf, sideOf, startPlay, useSim, viewer } from "../sim";
import { useStateId } from "../stateId";
import { GameGate, gateStateId, useGameBlock } from "./game-gate";

// p04 Partia gotowa `/games/{id}` (active, no `seen_at` of both players yet; map p04.1–p04.4, game-invitations #21 UI,
// Q20, Q21). Both clocks stand at 10:00 (BR-04); "Przejdź do planszy" draws the colours and opens p05.
const TEN_MINUTES = 600_000;

export function P04Ready() {
  const sim = useSim();
  const route = useGameRoute("p04");
  const block = useGameBlock("p04", route);
  const game = accessibleGame(sim);
  const phase = game ? phaseOf(sim, game) : null;
  const side = game ? sideOf(sim, game) : null;
  const account = viewer(sim);

  let stateId = "p04.1";
  if (phase === "autocancelled") stateId = "p04.3";
  else if (phase === "ready" && game?.seenCreator) stateId = "p04.2";
  if (side === "opponent" && game?.opponent?.kind === "guest") stateId = `${stateId} + p04.4`;
  useStateId("p04", block !== "none" ? gateStateId(sim, block) : stateId);

  if (block !== "none") return <GameGate kind={block} />;
  if (!game || route !== "p04") return <SiteHeader />;

  const guest = side === "opponent" && game.opponent?.kind === "guest";
  const mineName = side === "creator" ? nameOf(game.creator) : account ? account.name : "Gość";
  const theirName = side === "creator" ? opponentName(game) : nameOf(game.creator);

  if (phase === "autocancelled") {
    // L06 + A-07: the player who opened the page and the one who did not read different sentences.
    const opener = side === "opponent" || game.seenCreator;
    return (
      <>
        <SiteHeader />
        <Main narrow state={stateId}>
          <h1 className="m-0 text-section font-strong">Partia anulowana</h1>
          <Alert
            status="warning"
            title={opener ? "Przeciwnik nie otworzył partii w ciągu 15 minut. Partię anulowano." : "Partię anulowano: nie została otwarta w ciągu 15 minut."}
          >
            Nikt nie stracił czasu, a partia nie trafi do historii.
          </Alert>
          <div><Button onClick={() => go("p01")}>Wróć do panelu głównego</Button></div>
        </Main>
      </>
    );
  }

  const both = game.seenCreator;
  return (
    <>
      <SiteHeader />
      <Main state={stateId}>
        <h1 className="m-0 text-section font-strong">{both ? "Partia gotowa" : "Czekamy na otwarcie partii"}</h1>
        {guest && (
          // p04.4: permanent for a guest (BR-22).
          <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
            Stracisz dostęp do partii, a Twój zegar będzie biegł dalej.
          </Alert>
        )}
        <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
          <TurnStatus>
            {both ? "Partia gotowa" : `Czekamy, aż ${theirName} otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)`}
          </TurnStatus>
          <PlayerClock name={theirName} remainingMs={TEN_MINUTES} />
          <PlayerClock name={`Ty (${mineName})`} remainingMs={TEN_MINUTES} />
          {both && (
            <div className="flex flex-wrap items-center gap-group">
              <Button onClick={() => startPlay(game.id)}>Przejdź do planszy</Button>
              <TextLink href="#p01" placement="standalone">Wróć do panelu głównego</TextLink>
            </div>
          )}
        </div>
      </Main>
    </>
  );
}
