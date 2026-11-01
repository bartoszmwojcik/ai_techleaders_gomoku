"use client";

import { isLow } from "@gomoku/core/games/clock";
import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import { useRef, useState, useSyncExternalStore } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { apiCall } from "@/lib/api-client";
import {
  cellLabel,
  cellName,
  colorOfSeat,
  COLOR_NAME,
  COLOR_PLAYS,
  moveOf,
  outcomeOf,
  playerNameOf,
  stonesOf,
} from "@/lib/games/play";
import type { GameView } from "@/server/http/game-view";

import { GameClock } from "./game-clock";
import { PlayerLabel } from "./player-label";
import { RematchPanel } from "./rematch-panel";
import { useGameClock } from "./use-game-clock";

/** Failed polls in a row before the banner appears (L02); the counter lives in the room. */
export const PLAY_POLL_FAILURES_BEFORE_BANNER = 3;

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";
const RESIGN_UNKNOWN_ERROR = "Nie udało się poddać partii. Spróbuj ponownie.";
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
  /** "Wróciłeś do partii. Twój zegar: …" after a long absence (p05.10); the room decides when it shows and hides. */
  returnNotice?: string | null;
  /** The page was opened on a game that was already over (reload, another device): p06.5 says nothing changes. */
  reopened?: boolean;
  /** A fresh state read with `?after=<after>`; the room merges it. */
  onState: (next: GameView, after: number) => void;
  /** Reads the state now (after a refused move, or on "Sprawdź teraz"). */
  onRefresh: () => void;
  /** The rematch is being accepted (`true`) or the answer is in (`false`): the room reads nothing meanwhile. */
  onAccepting: (active: boolean) => void;
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

const LOW_TIME_ANNOUNCEMENT = "Zostało mniej niż minuta";

/**
 * The board of a game in progress or finished (p05, p06). It owns what the player is doing (the
 * selected intersection, the move in flight, the refusal); the room owns the game state and polls.
 * The clocks count down locally between two reads (`useGameClock`); when the running one reaches zero
 * the room reads the state at once, because only the server decides that the time is up. Resigning
 * and the rematch (phase 5) go under the board / the result.
 */
export function PlayField({ gameId, game, pollFails, returnNotice, reopened, onState, onRefresh, onAccepting, onGone }: Props) {
  const touch = useSyncExternalStore(subscribePointer, isTouch, notTouchOnServer);
  // A selection belongs to the move it was made for: it lapses with the next move or the end of the turn.
  const [pick, setPick] = useState<{ cell: number; moveCount: number } | null>(null);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [failed, setFailed] = useState<{ attempt: Attempt; message: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // State alone lags a double click by one render; the ref closes that gap.
  const inFlight = useRef(false);
  // The same for "Poddaj partię" (p05.14): the dialog stays open until the server answers.
  const resignInFlight = useRef(false);
  const [asking, setAsking] = useState(false);
  const [resigning, setResigning] = useState(false);
  const [resignError, setResignError] = useState<string | null>(null);

  const [tokenNoticeSeen, setTokenNoticeSeen] = useState(false);
  const guest = game.you.kind === "guest";

  const finished = game.status === "finished";
  const mine = game.players.find((player) => player.seat === game.you.seat);
  const other = game.players.find((player) => player.seat !== game.you.seat);
  const myColor = colorOfSeat(game.blackSeat, game.you.seat)!;
  const myTurn = !finished && game.turnSeat === game.you.seat;
  const busy = pending !== null;
  const clocks = useGameClock(game.clock, { finished, onExpire: onRefresh });
  // p05.3: a visually hidden live region says it once, when the player's own clock first drops below a minute.
  // It starts after mount (`live`), so the text is inserted into a page the reader already has, and it stays:
  // a read that corrects the time around the threshold does not say it again.
  const myLow = clocks.live && !finished && isLow(clocks.remainingMs[game.you.seat - 1]!);
  const [announced, setAnnounced] = useState(false);
  if (myLow && !announced) setAnnounced(true);
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

  async function resign() {
    if (resignInFlight.current) return;
    resignInFlight.current = true;
    setResigning(true);
    setResignError(null);
    // Resigning is idempotent on the server, so "Spróbuj ponownie" may send it again (Q5).
    const result = await apiCall<GameView>(`/api/games/${gameId}/resign`);
    resignInFlight.current = false;
    setResigning(false);
    if (result.ok) {
      setAsking(false);
      onState(result.data, 0);
      return;
    }
    const { code } = result.error;
    if (code === "NOT_FOUND") {
      setAsking(false);
      onGone();
    } else if (code === "GAME_FINISHED" || code === "GAME_NOT_ACTIVE") {
      // The game ended in the meantime (a five, the clock): the result is read and shown instead.
      setAsking(false);
      setRefusal(REFUSALS[code]!);
      onRefresh();
    } else {
      setResignError(code === "network" ? NETWORK_ERROR : RESIGN_UNKNOWN_ERROR);
    }
  }

  function onCellSelect(cell: number) {
    // A mouse places the stone at once. On touch only "Postaw kamień" sends a move (#181): a tap selects or moves
    // the selection, and tapping the selected intersection again changes nothing.
    if (!touch) void submit({ cell, moveNumber: game.moveCount + 1 });
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
      <h1 className="m-0 flex min-h-target items-center pr-12 text-section font-strong sm:pr-0">{finished ? "Koniec partii" : "Partia w toku"}</h1>
      <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
        {game.fromRematch && guest && !tokenNoticeSeen && (
          // p06.15: the guest holds a new token for the rematch, in the same browser (rematch Q5).
          <Alert status="info" title="Nowa partia ma nowy dostęp w tej przeglądarce" role="status">
            Wynik poprzedniej partii nie będzie już tu dostępny.{" "}
            <Button variant="secondary" onClick={() => setTokenNoticeSeen(true)} data-testid="token-notice-dismiss">
              Rozumiem
            </Button>
          </Alert>
        )}
        {returnNotice && !finished && <Alert status="info" title={returnNotice} role="status" />}
        {/* A finished game is read in the background for an offer: its failed reads are quiet (offline, a sleeping laptop). */}
        {!finished && pollFails > 0 && pollFails < PLAY_POLL_FAILURES_BEFORE_BANNER && (
          <p role="status" className="m-0 text-meta text-text-secondary">
            Ponawiamy sprawdzanie stanu partii (próba {pollFails} z {PLAY_POLL_FAILURES_BEFORE_BANNER}).
          </p>
        )}
        {!finished && pollFails >= PLAY_POLL_FAILURES_BEFORE_BANNER && (
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
        {finished && guest && (
          // p06.6: the guest token works for an hour after the end (BR-22).
          <p className="m-0 text-body text-text-secondary" data-testid="guest-until">
            Wynik zobaczysz w tej przeglądarce do 1 godziny po zakończeniu partii.
          </p>
        )}
        {finished && reopened && (
          // p06.5: back on a finished game; nothing can be played.
          <p role="status" className="m-0 text-body text-text-secondary" data-testid="reload-note">
            Powrót do zakończonej partii: wynik jest ten sam, ruch nie jest możliwy.
          </p>
        )}
        <span role="status" className="sr-only" data-testid="low-live">
          {announced ? LOW_TIME_ANNOUNCEMENT : ""}
        </span>
        <GameClock
          name={<PlayerLabel name={playerNameOf(other)} />}
          remainingMs={clocks.remainingMs[2 - game.you.seat]!}
          active={!myTurn && !finished}
          activeLabel="Ruch przeciwnika"
        />
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
        {refusal && <Alert status="warning" title={refusal} role="status" />}
        {failed && (
          <Alert status="danger" title={failed.message}>
            <Button variant="secondary" onClick={() => void submit(failed.attempt)}>
              Spróbuj ponownie
            </Button>
          </Alert>
        )}
        {guest && !finished && (
          // p05.11: permanent for a guest (BR-22) while the game is played. Under the action block, not above the board,
          // so it does not push "Postaw kamień" out of the first screen on a phone (#181).
          <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
            Stracisz dostęp do partii, a Twój zegar będzie biegł dalej.
          </Alert>
        )}
        {game.moveCount === 0 && !finished && (
          // L15: the draw is announced at the start only; the line under the board stays.
          <Alert
            status="info"
            title={
              game.fromRematch
                ? `Rewanż: kolory zostały zamienione. Grasz ${COLOR_PLAYS[myColor]}.`
                : `Wylosowano: Ty grasz ${COLOR_PLAYS[myColor]}.`
            }
            role="status"
          />
        )}
        <GameClock
          name={<PlayerLabel name={playerNameOf(mine)} you />}
          remainingMs={clocks.remainingMs[game.you.seat - 1]!}
          active={myTurn}
          activeLabel="Twój ruch"
        />
        <p className="m-0 text-body text-text-secondary" data-testid="my-color">
          {finished ? "Grałeś" : "Grasz"} {COLOR_PLAYS[myColor]}.
        </p>
        {!finished && (
          // p05.13, p05.14: any time in a game in progress, also out of turn (resignation Q1).
          <div>
            {/* LUKA: the confirm dialog has no slot for an error; the description carries it as an alert. */}
            <ConfirmDialog
              open={asking}
              onOpenChange={(open) => {
                if (resigning) return;
                setResignError(null);
                setAsking(open);
              }}
              trigger={
                <Button variant="secondary" data-testid="resign">
                  Poddaj partię
                </Button>
              }
              title="Czy na pewno chcesz się poddać?"
              description={
                <>
                  {resignError && (
                    <span role="alert" className="mb-group block font-strong text-status-danger">
                      {resignError}
                    </span>
                  )}
                  Przeciwnik wygra partię.
                </>
              }
              confirmLabel={resigning ? "Poddawanie…" : resignError ? "Spróbuj ponownie" : "Poddaj partię"}
              cancelLabel="Wróć do gry"
              confirming={resigning}
              onConfirm={() => void resign()}
            />
          </div>
        )}
        {finished && (
          // D06: no component for the actions after the end; the block is built from Alert and Button.
          <RematchPanel gameId={gameId} game={game} reopened={reopened ?? false} onState={onState} onRefresh={onRefresh} onAccepting={onAccepting} onGone={onGone} />
        )}
        {/* E07-S01: under the controls and, on the result screen, under the rematch block, so it never pushes the main action down. */}
        <ChatPanel gameId={gameId} game={game} onGone={onGone} />
      </div>
    </>
  );
}
