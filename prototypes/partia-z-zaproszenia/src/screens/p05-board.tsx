import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import { useEffect, useState } from "react";

import { Main, SiteHeader, useCurrentScreen, useGameRoute } from "../chrome";
import { cellLabel } from "../demo";
import {
  accessibleGame,
  colorOf,
  dismissTokenNotice,
  guestToken,
  LOW_TIME,
  moverOf,
  placeStone,
  remainingMs,
  resignGame,
  returnFromBackground,
  sideOf,
  useSim,
} from "../sim";
import { useStateId } from "../stateId";
import { GameGate, gateStateId, useGameBlock } from "./game-gate";
import { COLOR_NAME, COLOR_PLAYS, GameClock, PlayerLabel, playerNames } from "./play-shared";

// p05 Partia w toku `/games/{id}` (active, both players opened the page; map p05.1–p05.14, game-moves #22 UI, Q4, Q7,
// game-clock #23, reconnection #24, resignation). The server rules live in `sim.ts`; this screen only shows them.

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";
const LOW_ANNOUNCEMENT = "Zostało mniej niż minuta";

type Message = { id: "p05.8" | "p05.9"; text: string };
const MESSAGES = {
  stale: { id: "p05.8", text: "Plansza była nieaktualna i została odświeżona. Spróbuj ponownie." },
  "not-your-turn": { id: "p05.8", text: "Teraz ruch przeciwnika. Plansza została odświeżona." },
  occupied: { id: "p05.9", text: "To pole jest już zajęte" },
  finished: { id: "p05.8", text: "Partia jest już zakończona. Plansza została odświeżona." },
} as const satisfies Record<string, Message>;

/** The pointer device decides between one click and two steps (#22 Q7); "auto" asks the browser. */
function useTouchMode(mode: "auto" | "mouse" | "touch"): boolean {
  if (mode !== "auto") return mode === "touch";
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

export function P05Board() {
  const sim = useSim();
  const route = useGameRoute("p05");
  const block = useGameBlock("p05", route);
  const current = useCurrentScreen();
  const game = accessibleGame(sim);
  const side = game ? sideOf(sim, game) : null;
  const play = game?.play ?? null;
  const touch = useTouchMode(sim.scenario.input);

  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [failedCell, setFailedCell] = useState<number | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [asking, setAsking] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [resignError, setResignError] = useState(false);
  const [pollFails, setPollFails] = useState(0);
  const [announced, setAnnounced] = useState(false);

  const gameId = game?.id;
  useEffect(() => {
    setSelected(null);
    setPending(null);
    setFailedCell(null);
    setMessage(null);
    setAsking(false);
    setResigning(false);
    setResignError(false);
    setPollFails(0);
    setAnnounced(false);
  }, [gameId, sim.epoch, sim.reload, sim.role]);

  const myTurn = play !== null && side !== null && moverOf(play) === side;
  const mineLow = play !== null && side !== null && remainingMs(sim, play, side) < LOW_TIME;

  // p05.3: the hidden live region says it once, when the player's own clock first drops below a minute.
  useEffect(() => {
    if (mineLow) setAnnounced(true);
  }, [mineLow]);

  // The selection of a touch player does not outlive his turn.
  useEffect(() => {
    if (!myTurn) setSelected(null);
  }, [myTurn]);

  // The opponent's move is read every 2 s in the product (#22 Q5); the prototype fails three times while the scenario says so (L02).
  const polling = current === "p05" && play !== null && !play.result && !myTurn && !sim.bg;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => setPollFails((n) => (sim.scenario.pollError ? Math.min(n + 1, 3) : 0)), 1000);
    return () => clearInterval(timer);
  }, [polling, sim.scenario.pollError]);

  // A real tab in the background counts too (#24 Q5): the prototype moves the demo time by the real absence.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const listener = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt !== null) {
        returnFromBackground(Math.round((Date.now() - hiddenAt) / 1000));
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);

  // Map state ids that apply at once (A-21 of the grey prototype): the first is p05.1 or p05.2.
  const ids: string[] = [myTurn ? "p05.1" : "p05.2"];
  if (sim.bg) ids.push("p05.12");
  if (pending !== null) ids.push("p05.6");
  if (failedCell !== null || resignError || pollFails >= 3) ids.push("p05.7");
  if (message) ids.push(message.id);
  if (sim.returned) ids.push("p05.10");
  if (mineLow) ids.push("p05.3");
  if (touch ? selected !== null : myTurn && pending === null && failedCell === null) ids.push(touch ? "p05.4" : "p05.5");
  if (game && guestToken(sim) === game.id) ids.push("p05.11");
  if (asking) ids.push("p05.13");
  if (resigning) ids.push("p05.14");
  if (play?.tokenNotice) ids.push("p06.15");
  useStateId("p05", block !== "none" ? gateStateId(sim, block) : ids.join(" + "));

  if (block !== "none") return <GameGate kind={block} />;
  if (!game || !play || !side || route !== "p05") return <SiteHeader />;

  const names = playerNames(sim, game, side);
  const myColor = colorOf(play, side);
  const guest = guestToken(sim) === game.id;
  const stones = pending === null ? play.moves : [...play.moves, { cell: pending, color: myColor }];
  const lastMove = pending ?? play.moves.at(-1)?.cell;
  const busy = pending !== null;

  async function submit(cell: number) {
    if (busy) return;
    setMessage(null);
    setFailedCell(null);
    setSelected(null);
    setPending(cell);
    const result = await placeStone(game!.id, cell);
    setPending(null);
    if (result.kind === "network") setFailedCell(cell);
    else if (result.kind !== "ok") setMessage(MESSAGES[result.kind]);
  }

  function onCellSelect(cell: number) {
    if (!touch || selected === cell) void submit(cell);
    else {
      setMessage(null);
      setFailedCell(null);
      setSelected(cell);
    }
  }

  async function onResign() {
    if (resigning) return;
    setResigning(true);
    setResignError(false);
    const result = await resignGame(game!.id);
    setResigning(false);
    if (result.kind === "network") setResignError(true);
    else setAsking(false);
  }

  const column = selected === null ? "" : `Kolumna ${String.fromCharCode(65 + (selected % 15))}, rząd ${Math.floor(selected / 15) + 1}`;
  const status = busy ? "Wysyłanie ruchu…" : myTurn ? `Twój ruch (${COLOR_NAME[myColor]})` : "Ruch przeciwnika";

  return (
    <>
      <SiteHeader />
      <Main state={ids.join(" + ")} assumption={guest || names.theirs.guest ? "L30" : undefined}>
        <h1 className="m-0 text-section font-strong">Partia w toku</h1>
        <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
          {guest && (
            // p05.11: permanent for a guest, creator or joiner (BR-29).
            <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
              Stracisz dostęp do partii, a Twój zegar będzie biegł dalej.
            </Alert>
          )}
          {play.tokenNotice && (
            // p06.15: the guest holds a new token for the rematch, in the same browser.
            <Alert status="info" title="Nowa partia ma nowy dostęp w tej przeglądarce" role="status">
              Wynik poprzedniej partii nie będzie już tu dostępny.{" "}
              <Button variant="secondary" onClick={() => dismissTokenNotice(game.id)}>Rozumiem</Button>
            </Alert>
          )}
          {play.moves.length === 0 && (
            // L15: the draw is announced at the start only; the line under the board stays.
            <Alert status="info" title={play.fromRematch ? `Rewanż: kolory zostały zamienione. Grasz ${COLOR_PLAYS[myColor]}.` : `Wylosowano: Ty grasz ${COLOR_PLAYS[myColor]}.`} role="status" />
          )}
          {sim.returned && (
            // p05.10: after more than 30 s away (#24 Q2); disappears with the next move.
            <Alert status="info" title={sim.returned.text} role="status" />
          )}
          {sim.bg && <p role="status" className="m-0 text-meta text-text-secondary">Karta w tle: odpytywanie wstrzymane.</p>}
          {pollFails > 0 && pollFails < 3 && (
            <p role="status" className="m-0 text-meta text-text-secondary">Ponawiamy sprawdzanie stanu partii (próba {pollFails} z 3).</p>
          )}
          {pollFails >= 3 && (
            <Alert status="danger" title="Nie udało się sprawdzić stanu partii. Ponawiamy próby.">
              <Button variant="secondary" onClick={() => setPollFails(0)}>Sprawdź teraz</Button>
            </Alert>
          )}
          <span role="status" className="sr-only" data-testid="low-live">{announced ? LOW_ANNOUNCEMENT : ""}</span>
          <TurnStatus color={play.turn}>{status}</TurnStatus>
          <GameClock sim={sim} play={play} side={side === "creator" ? "opponent" : "creator"} name={<PlayerLabel name={names.theirs} />} activeLabel="Ruch przeciwnika" />
          <Board
            label="Plansza 15 na 15"
            cellLabel={cellLabel}
            stones={stones}
            lastMove={lastMove}
            selected={touch && selected !== null && myTurn && !busy ? { cell: selected, color: myColor } : undefined}
            readOnly={!myTurn || busy}
            onCellSelect={onCellSelect}
          />
          <GameClock sim={sim} play={play} side={side} name={<PlayerLabel name={names.mine} you />} activeLabel="Twój ruch" />
          <p className="m-0 text-body text-text-secondary" data-testid="my-color">Grasz {COLOR_PLAYS[myColor]}.</p>
          {message && <Alert status="warning" title={message.text} role="status" />}
          {failedCell !== null && (
            <Alert status="danger" title={NETWORK_ERROR}>
              <Button variant="secondary" onClick={() => void submit(failedCell)}>Spróbuj ponownie</Button>
            </Alert>
          )}
          {touch && (
            <div className="flex flex-col items-start gap-group">
              {/* LUKA D01: no pattern for "selected intersection + confirm"; the Board's `selected` and a Button stand in. */}
              <Button disabled={selected === null || !myTurn || busy} onClick={() => selected !== null && void submit(selected)}>Postaw kamień</Button>
              <p role="status" className="m-0 text-meta text-text-secondary" data-testid="selection">
                {selected !== null && myTurn ? `Zaznaczono: ${column}. Naciśnij „Postaw kamień”.` : myTurn ? "Dotknij przecięcia, żeby je zaznaczyć." : "Poczekaj na ruch przeciwnika."}
              </p>
            </div>
          )}
          <div>
            {/* LUKA: the confirm dialog has no slot for an error; the description carries it as an alert. */}
            <ConfirmDialog
              open={asking}
              onOpenChange={(open) => !resigning && setAsking(open)}
              trigger={<Button variant="secondary">Poddaj partię</Button>}
              title="Czy na pewno chcesz się poddać?"
              description={
                <>
                  {resignError && <span role="alert" className="mb-group block font-strong text-status-danger">{NETWORK_ERROR}</span>}
                  Przeciwnik wygra partię.
                </>
              }
              confirmLabel={resigning ? "Poddawanie…" : resignError ? "Spróbuj ponownie" : "Poddaj partię"}
              cancelLabel="Wróć do gry"
              confirming={resigning}
              onConfirm={() => void onResign()}
            />
          </div>
        </div>
      </Main>
    </>
  );
}
