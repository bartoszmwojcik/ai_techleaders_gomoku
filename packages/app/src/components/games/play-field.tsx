"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";

import { apiCall } from "@/lib/api-client";
import {
  cellLabel,
  cellName,
  colorOfSeat,
  COLOR_NAME,
  COLOR_PLAYS,
  moveOf,
  outcomeOf,
  playerName,
  stonesOf,
} from "@/lib/games/play";
import type { GameView } from "@/server/http/game-view";

/** Failed polls in a row before the banner appears (L02); the counter lives in the room. */
export const PLAY_POLL_FAILURES_BEFORE_BANNER = 3;

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";
const UNKNOWN_ERROR = "Nie udało się zagrać ruchu. Spróbuj ponownie.";

/** Messages of the moves the server turned down; the board is refreshed next to them (p05.8, p05.9). */
const REFUSALS: Record<string, string> = {
  STALE_MOVE: "Plansza była nieaktualna i została odświeżona. Spróbuj ponownie.",
  NOT_YOUR_TURN: "Teraz ruch przeciwnika. Plansza została odświeżona.",
  CELL_OCCUPIED: "To pole jest już zajęte",
  GAME_FINISHED: "Partia jest już zakończona. Plansza została odświeżona.",
  GAME_NOT_ACTIVE: "Partia jest już zakończona. Plansza została odświeżona.",
};

type Props = {
  gameId: string;
  game: GameView;
  /** Consecutive failed reads of the state (owned by the room, which polls). */
  pollFails: number;
  /** A fresh state read with `?after=<after>`; the room merges it. */
  onState: (next: GameView, after: number) => void;
  /** Reads the state now (after a refused move, or on "Sprawdź teraz"). */
  onRefresh: () => void;
  /** The game is gone for this visitor (`404`). */
  onGone: () => void;
};

type Attempt = { cell: number; moveNumber: number };

// The pointer device decides between one click and two steps (#22 Q7). The server cannot know it.
const subscribePointer = (notify: () => void) => {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
const notTouchOnServer = () => false;

// Reserve for the clocks (#23): the bar has the size and the outline of the Zegar gracza, the digits
// come with the clock. The player on turn is marked by the outline and a word, not by colour alone.
function ClockSlot({ name, active, activeLabel }: { name: string; active: boolean; activeLabel: string }) {
  return (
    <div
      data-slot="clock"
      className={`flex min-h-target flex-col rounded-base border bg-surface-raised p-4 wrap-anywhere ${
        active ? "border-text-primary" : "border-border-default"
      }`}
    >
      <span className="text-meta font-strong text-text-secondary">{name}</span>
      {active && <span className="text-meta text-text-primary">{activeLabel}</span>}
    </div>
  );
}

/**
 * The board of a game in progress or finished (p05, p06). It owns what the player is doing (the
 * selected intersection, the move in flight, the refusal); the room owns the game state and polls.
 * Hooks for the next phases: the clock bars (#23) are the two `data-slot="clock"` rows, resigning
 * and the rematch (phase 5) go under the board / the result.
 */
export function PlayField({ gameId, game, pollFails, onState, onRefresh, onGone }: Props) {
  const touch = useSyncExternalStore(subscribePointer, isTouch, notTouchOnServer);
  // A selection belongs to the move it was made for: it lapses with the next move or the end of the turn.
  const [pick, setPick] = useState<{ cell: number; moveCount: number } | null>(null);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [failed, setFailed] = useState<{ attempt: Attempt; message: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // State alone lags a double click by one render; the ref closes that gap.
  const inFlight = useRef(false);

  const finished = game.status === "finished";
  const mine = game.players.find((player) => player.seat === game.you.seat);
  const other = game.players.find((player) => player.seat !== game.you.seat);
  const myColor = colorOfSeat(game.blackSeat, game.you.seat)!;
  const myTurn = !finished && game.turnSeat === game.you.seat;
  const busy = pending !== null;
  const outcome = outcomeOf(game);
  const lastMove = game.moves.at(-1);

  const selected = myTurn && pick?.moveCount === game.moveCount ? pick.cell : null;

  async function submit(attempt: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefusal(null);
    setFailed(null);
    setPick(null);
    setPending(attempt);
    const after = attempt.moveNumber - 1;
    const result = await apiCall<GameView>(`/api/games/${gameId}/moves`, {
      body: moveOf(attempt.cell, attempt.moveNumber),
    });
    inFlight.current = false;
    setPending(null);
    if (result.ok) {
      onState(result.data, after);
      return;
    }
    const { code } = result.error;
    if (code === "NOT_FOUND") onGone();
    else if (code in REFUSALS) {
      setRefusal(REFUSALS[code]!);
      onRefresh();
    } else {
      // The same move is sent again with the same number: the server answers a repeat with 200 (Q4).
      setFailed({ attempt, message: code === "network" ? NETWORK_ERROR : UNKNOWN_ERROR });
    }
  }

  function onCellSelect(cell: number) {
    if (!touch || selected === cell) void submit({ cell, moveNumber: game.moveCount + 1 });
    else {
      setRefusal(null);
      setFailed(null);
      setPick({ cell, moveCount: game.moveCount });
    }
  }

  const stones = pending ? [...stonesOf(game.moves), { cell: pending.cell, color: myColor }] : stonesOf(game.moves);
  const status = busy ? "Wysyłanie ruchu…" : myTurn ? `Twój ruch (${COLOR_NAME[myColor]})` : "Ruch przeciwnika";

  return (
    <>
      <h1 className="m-0 text-section font-strong">{finished ? "Koniec partii" : "Partia w toku"}</h1>
      <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
        {game.you.kind === "guest" && (
          // p05.11: permanent for a guest (BR-22).
          <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
            Stracisz dostęp do partii, a Twój zegar będzie biegł dalej.
          </Alert>
        )}
        {game.moveCount === 0 && !finished && (
          // L15: the draw is announced at the start only; the line under the board stays.
          <Alert status="info" title={`Wylosowano: Ty grasz ${COLOR_PLAYS[myColor]}.`} role="status" />
        )}
        {pollFails > 0 && pollFails < PLAY_POLL_FAILURES_BEFORE_BANNER && (
          <p role="status" className="m-0 text-meta text-text-secondary">
            Ponawiamy sprawdzanie stanu partii (próba {pollFails} z {PLAY_POLL_FAILURES_BEFORE_BANNER}).
          </p>
        )}
        {pollFails >= PLAY_POLL_FAILURES_BEFORE_BANNER && (
          <Alert status="danger" title="Nie udało się sprawdzić stanu partii. Ponawiamy próby.">
            <Button variant="secondary" onClick={onRefresh}>
              Sprawdź teraz
            </Button>
          </Alert>
        )}
        {outcome ? (
          <GameResultBanner result={outcome.result} title={outcome.title}>
            {outcome.detail}
          </GameResultBanner>
        ) : (
          <TurnStatus color={colorOfSeat(game.blackSeat, game.turnSeat!)!}>{status}</TurnStatus>
        )}
        <ClockSlot name={playerName(other)} active={!myTurn && !finished} activeLabel="Ruch przeciwnika" />
        <Board
          label="Plansza 15 na 15"
          cellLabel={cellLabel}
          stones={stones}
          lastMove={pending?.cell ?? lastMove}
          winLine={game.result?.winLine ?? undefined}
          selected={touch && selected !== null && !busy ? { cell: selected, color: myColor } : undefined}
          readOnly={!myTurn || busy}
          onCellSelect={onCellSelect}
        />
        {myTurn && lastMove !== undefined && (
          // The opponent's stone appears on its own; a screen reader hears where (visually hidden).
          <p role="status" className="sr-only" data-testid="opponent-move">
            Przeciwnik: {cellName(lastMove).replace(/^K/, "k")}
          </p>
        )}
        <ClockSlot name={`Ty (${playerName(mine)})`} active={myTurn} activeLabel="Twój ruch" />
        <p className="m-0 text-body text-text-secondary" data-testid="my-color">
          {finished ? "Grałeś" : "Grasz"} {COLOR_PLAYS[myColor]}.
        </p>
        {refusal && <Alert status="warning" title={refusal} role="status" />}
        {failed && (
          <Alert status="danger" title={failed.message}>
            <Button variant="secondary" onClick={() => void submit(failed.attempt)}>
              Spróbuj ponownie
            </Button>
          </Alert>
        )}
        {touch && !finished && (
          <div className="flex flex-col items-start gap-group">
            {/* LUKA D01: no pattern for "selected intersection + confirm"; the Board's `selected` and a Button stand in. */}
            <Button
              disabled={selected === null || busy}
              onClick={() => selected !== null && void submit({ cell: selected, moveNumber: game.moveCount + 1 })}
            >
              Postaw kamień
            </Button>
            <p role="status" className="m-0 text-meta text-text-secondary" data-testid="selection">
              {selected !== null
                ? `Zaznaczono: ${cellName(selected)}. Naciśnij „Postaw kamień”.`
                : myTurn
                  ? "Dotknij przecięcia, żeby je zaznaczyć."
                  : "Poczekaj na ruch przeciwnika."}
            </p>
          </div>
        )}
        {finished && (
          // D06: the rematch block (phase 5) goes here, next to the way back.
          <div>
            <Button asChild variant="secondary">
              <Link href="/">Wróć do panelu głównego</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
