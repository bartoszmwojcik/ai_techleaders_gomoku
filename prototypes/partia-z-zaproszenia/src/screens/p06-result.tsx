import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { GameResultBanner, type GameResult } from "@gomoku/ui/game/game-result-banner";
import { useEffect, useState } from "react";

import { go, Main, OutsideLink, SiteHeader, useGameRoute } from "../chrome";
import { cellLabel } from "../demo";
import {
  accessibleGame,
  acceptRematch,
  clearRematch,
  colorOf,
  dismissTokenNotice,
  guestToken,
  leaveToPanel,
  proposeRematch,
  rematchView,
  sideOf,
  useSim,
  type GameResult as SimResult,
  type StoneSide,
} from "../sim";
import { useStateId } from "../stateId";
import { GameGate, gateStateId, useGameBlock } from "./game-gate";
import { COLOR_PLAYS, GameClock, playerNames } from "./play-shared";

// p06 Koniec partii `/games/{id}` (finished; map p06.1–p06.15, game-moves #22 K3 K4, clock #23 K3, reconnection #24 K3,
// guest token #21 K8, resignation, rematch). The result is the server's; the board is read-only and the clocks stand still.

type Outcome = { id: string; result: GameResult; title: string; detail: string };

/** The banner of a result, from the point of view of the viewer (texts of the grey prototype, A-17). */
function outcomeOf(result: SimResult, side: StoneSide): Outcome {
  const won = result.winner === side;
  if (result.kind === "draw") return { id: "p06.4", result: "draw", title: "Remis", detail: "Plansza jest pełna, nikt nie ułożył pięciu kamieni." };
  if (result.kind === "five") {
    return won
      ? { id: "p06.1", result: "win", title: "Wygrałeś", detail: "Ułożyłeś pięć kamieni w jednej linii." }
      : { id: "p06.2", result: "loss", title: "Przegrałeś", detail: "Przeciwnik ułożył pięć kamieni w jednej linii." };
  }
  if (result.kind === "timeout") {
    return won
      ? { id: "p06.1", result: "win", title: "Wygrałeś — przeciwnikowi skończył się czas", detail: "" }
      : { id: "p06.3", result: "loss", title: "Przegrałeś — skończył się Twój czas", detail: "" };
  }
  return won
    ? { id: "p06.8", result: "win", title: "Wygrałeś, przeciwnik poddał partię", detail: "" }
    : { id: "p06.9", result: "loss", title: "Przegrałeś, poddałeś partię", detail: "" };
}

export function P06Result() {
  const sim = useSim();
  const route = useGameRoute("p06");
  const block = useGameBlock("p06", route);
  const game = accessibleGame(sim);
  const side = game ? sideOf(sim, game) : null;
  const play = game?.play ?? null;
  const [accepting, setAccepting] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [declined, setDeclined] = useState(false);

  const gameId = game?.id;
  useEffect(() => {
    setAccepting(false);
    setConflict(false);
    setDeclined(false);
  }, [gameId, sim.epoch, sim.reload, sim.role]);

  const result = play?.result ?? null;
  const rematch = game && side ? rematchView(sim, game, side) : { kind: "none" as const };
  const guest = guestToken(sim) === gameId;

  const ids: string[] = [result && side ? outcomeOf(result, side).id : "p06.1"];
  if (sim.refreshed) ids.push("p06.5");
  if (guest) ids.push("p06.6");
  ids.push({ none: "p06.10", mine: "p06.11", theirs: "p06.12", declined: "p06.13", expired: "p06.14" }[rematch.kind]);
  if (guest && (rematch.kind === "mine" || rematch.kind === "theirs")) ids.push("p06.15");
  if (play?.tokenNotice) ids.push("p06.15");
  useStateId("p06", block !== "none" ? gateStateId(sim, block) : ids.join(" + "));

  if (block !== "none") return <GameGate kind={block} />;
  if (!game || !play || !side || !result || route !== "p06") return <SiteHeader />;

  const outcome = outcomeOf(result, side);
  const names = playerNames(sim, game, side);
  const myColor = colorOf(play, side);
  const nextColor = myColor === "black" ? "white" : "black";

  function leave() {
    leaveToPanel();
    go("p01");
  }

  async function onAccept() {
    if (accepting) return;
    setAccepting(true);
    setConflict(false);
    const answer = await acceptRematch();
    setAccepting(false);
    if (answer.kind === "conflict") setConflict(true);
  }

  const back = <Button variant="secondary" onClick={leave}>Wróć do panelu głównego</Button>;
  const guestNote = guest && (
    <p className="m-0 text-meta text-text-secondary" data-testid="guest-rematch-note">Jako gość dostaniesz nowy dostęp do nowej partii w tej przeglądarce.</p>
  );

  return (
    <>
      <SiteHeader />
      <Main state={ids.join(" + ")}>
        <h1 className="m-0 text-section font-strong">Koniec partii</h1>
        <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
          {play.tokenNotice && (
            <Alert status="info" title="Nowa partia ma nowy dostęp w tej przeglądarce" role="status">
              Wynik poprzedniej partii nie będzie już tu dostępny.{" "}
              <Button variant="secondary" onClick={() => dismissTokenNotice(game.id)}>Rozumiem</Button>
            </Alert>
          )}
          <GameResultBanner result={outcome.result} title={outcome.title}>{outcome.detail}</GameResultBanner>
          {guest && <p className="m-0 text-body text-text-secondary" data-testid="guest-until">Wynik zobaczysz w tej przeglądarce do 1 godziny po zakończeniu partii.</p>}
          {sim.refreshed && (
            <p role="status" className="m-0 text-body text-text-secondary" data-testid="reload-note">Powrót do zakończonej partii: wynik jest ten sam, ruch nie jest możliwy.</p>
          )}
          <GameClock sim={sim} play={play} side={side === "creator" ? "opponent" : "creator"} name={names.theirs} activeLabel="" />
          <Board
            label="Plansza 15 na 15"
            cellLabel={cellLabel}
            stones={play.moves}
            lastMove={play.moves.at(-1)?.cell}
            winLine={result.line.length > 0 ? result.line : undefined}
            readOnly
          />
          <GameClock sim={sim} play={play} side={side} name={`Ty (${names.mine})`} activeLabel="" />
          <p className="m-0 text-body text-text-secondary">Grałeś {COLOR_PLAYS[myColor]}.</p>
          {/* LUKA D06: no component for the actions after the end of a game; the rematch block is built from Alert and Button. */}
          <section aria-labelledby="rematch-h" className="flex flex-col gap-stack" data-testid="rematch-box">
            <h2 id="rematch-h" className="m-0 text-subsection font-strong">Rewanż</h2>
            {rematch.kind === "none" && (
              <>
                <p className="m-0 text-body text-text-secondary" data-testid="rm-info">Rewanż to nowa partia z odwróconymi kolorami: zagrasz {COLOR_PLAYS[nextColor]}.</p>
                {declined && <p role="status" className="m-0 text-body text-text-secondary" data-testid="rm-status">Odrzuciłeś propozycję rewanżu.</p>}
                {guestNote}
                <div className="flex flex-wrap items-center gap-group">
                  <Button onClick={() => { setDeclined(false); proposeRematch(); }}>Rewanż</Button>
                  {back}
                </div>
              </>
            )}
            {rematch.kind === "mine" && (
              <>
                <p role="status" className="m-0 text-body text-text-primary" data-testid="rm-status">Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min).</p>
                {guestNote}
                <div className="flex flex-wrap items-center gap-group">
                  <Button variant="secondary" onClick={() => clearRematch()}>Wycofaj propozycję</Button>
                  {back}
                </div>
              </>
            )}
            {rematch.kind === "theirs" && (
              <>
                <p role="status" className="m-0 text-body text-text-primary" data-testid="rm-status">{names.theirs} proponuje rewanż. Kolory zostaną zamienione.</p>
                {guestNote}
                {conflict && (
                  <Alert status="warning" title="Masz już partię">
                    Nie można zacząć rewanżu, bo któryś z graczy ma inną partię w toku (409). Propozycja trwa do wygaśnięcia lub odrzucenia.{" "}
                    <OutsideLink name="Twoja inna partia" kind="board">Przejdź do partii</OutsideLink>
                  </Alert>
                )}
                <div className="flex flex-wrap items-center gap-group">
                  <Button loading={accepting} onClick={() => void onAccept()}>{accepting ? "Przyjmowanie…" : "Przyjmij"}</Button>
                  <Button variant="secondary" onClick={() => { setConflict(false); setDeclined(true); clearRematch(); }}>Odrzuć</Button>
                  {back}
                </div>
              </>
            )}
            {rematch.kind === "declined" && (
              <>
                <Alert status="warning" title="Zaproszenie do rewanżu odrzucone" role="status">
                  {rematch.how === "left" ? "Przeciwnik wyszedł do panelu głównego." : "Przeciwnik odrzucił rewanż."}
                </Alert>
                <div><Button onClick={leave}>Wróć do panelu głównego</Button></div>
              </>
            )}
            {rematch.kind === "expired" && (
              <>
                <p role="status" className="m-0 text-body text-text-primary" data-testid="rm-status">Zaproszenie do rewanżu wygasło (po 5 minutach).</p>
                <div className="flex flex-wrap items-center gap-group">
                  <Button onClick={() => { clearRematch(); }}>Zaproponuj ponownie</Button>
                  {back}
                </div>
              </>
            )}
          </section>
        </div>
      </Main>
    </>
  );
}
