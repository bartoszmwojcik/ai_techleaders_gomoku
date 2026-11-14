"use client";

import { cellOf, coordsOf } from "@gomoku/core/games/board";
import { isLow } from "@gomoku/core/games/clock";
import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import { PaperBoard } from "@gomoku/ui/game/paper-board";
import { PaperMark } from "@gomoku/ui/game/paper-mark";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import { useRef, useState, useSyncExternalStore } from "react";

import { ChatPanel } from "@/components/chat/chat-panel";
import { CloseAudience } from "@/components/games/close-audience";
import { PublicFlag } from "@/components/games/public-flag";
import { PublicGameQr } from "@/components/games/public-game-qr";
import plCommon from "@/i18n/catalogs/pl/common";
import plGame from "@/i18n/catalogs/pl/game";
import { useT } from "@/i18n/context";
import { apiCall } from "@/lib/api-client";
import {
  botOf,
  cellLabelOf,
  cellName,
  colorOfSeat,
  opponentMoveText,
  outcomeOf,
  playerNameOf,
  paperStonesOf,
  sideWords,
  stonesOf,
} from "@/lib/games/play";
import { guestNickname } from "@/lib/games/opponent";
import { FIRST_STONE, lastPaperMove, opponentPaperMove, paperColors, paperLabelsOf, paperRules, refusalText } from "@/lib/games/paper";
import type { GameView } from "@/server/http/game-view";

import { BotReplay } from "./bot-replay";
import { GameClock } from "./game-clock";
import { PlayerLabel } from "./player-label";
import { RematchPanel } from "./rematch-panel";
import { useGameClock } from "./use-game-clock";

/** Failed polls in a row before the banner appears (L02); the counter lives in the room. */
export const PLAY_POLL_FAILURES_BEFORE_BANNER = 3;

/**
 * Codes of the moves the server turned down, with their text in `field.refusals`; the board is refreshed next to them
 * (p05.8, p05.9). `GAME_NOT_ACTIVE` reads like `GAME_FINISHED`; the last two come only from the paper game.
 */
const REFUSALS = {
  STALE_MOVE: "STALE_MOVE",
  NOT_YOUR_TURN: "NOT_YOUR_TURN",
  CELL_OCCUPIED: "CELL_OCCUPIED",
  GAME_FINISHED: "GAME_FINISHED",
  GAME_NOT_ACTIVE: "GAME_FINISHED",
  MOVE_TOO_FAR: "MOVE_TOO_FAR",
  FIRST_MOVE_CENTER: "FIRST_MOVE_CENTER",
} as const;

const refusalOf = (code: string) => (code in REFUSALS ? REFUSALS[code as keyof typeof REFUSALS] : null);

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

type Attempt = { x: number; y: number; moveNumber: number };

// The pointer device decides between one click and two steps (#22 Q7). The server cannot know it.
const subscribePointer = (notify: () => void) => {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
const notTouchOnServer = () => false;


/**
 * The board of a game in progress or finished (p05, p06). It owns what the player is doing (the
 * selected intersection, the move in flight, the refusal); the room owns the game state and polls.
 * The clocks count down locally between two reads (`useGameClock`); when the running one reaches zero
 * the room reads the state at once, because only the server decides that the time is up. Resigning
 * and the rematch (phase 5) go under the board / the result.
 */
export function PlayField({ gameId, game, pollFails, returnNotice, reopened, onState, onRefresh, onAccepting, onGone }: Props) {
  const touch = useSyncExternalStore(subscribePointer, isTouch, notTouchOnServer);
  const t = useT("game", plGame);
  const common = useT("common", plCommon);
  // A selection belongs to the move it was made for: it lapses with the next move or the end of the turn.
  const [pick, setPick] = useState<{ x: number; y: number; moveCount: number } | null>(null);
  // "Wyśrodkuj" on the phone (the paper board has no toolbar there): each press changes the board's recentre token.
  const [recentered, setRecentered] = useState(0);
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
  // A game with the bot (hosted-bot spec): no chat, no rematch, "Bot myśli…" while it is to move.
  const bot = botOf(game);
  const myColor = colorOfSeat(game.blackSeat, game.you.seat)!;
  const paper = game.paper;
  const words = sideWords(game.variant, t);
  const placeLabel = words.place[myColor];
  // The automat plays for the leading player whose time ran out (BR-50): a turn that belongs to the automat is nobody's.
  const autoTurn = paper !== undefined && paper.autoSeat !== null && game.turnSeat === paper.autoSeat;
  const myTurn = !finished && game.turnSeat === game.you.seat && !autoTurn;
  const busy = pending !== null;
  const clocks = useGameClock(game.clock, { finished, onExpire: onRefresh });
  // p05.3: a visually hidden live region says it once, when the player's own clock first drops below a minute.
  // It starts after mount (`live`), so the text is inserted into a page the reader already has, and it stays:
  // a read that corrects the time around the threshold does not say it again.
  const myLow = clocks.live && !finished && isLow(clocks.remainingMs[game.you.seat - 1]!, game.timeControlMs);
  const [announced, setAnnounced] = useState(false);
  if (myLow && !announced) setAnnounced(true);
  const outcome = outcomeOf(game, t);
  const lastMove = game.moves.at(-1);
  const stonesOnSheet = paper ? paperStonesOf(paper) : [];
  const rules = paperRules(stonesOnSheet);

  // Classic: the selected intersection (a cell). Paper: the selected field; the first stone starts in the middle.
  const classicSelected = myTurn && pick?.moveCount === game.moveCount ? cellOf(pick.x, pick.y) : null;
  const paperSelected = !paper || !myTurn ? null : pick?.moveCount === game.moveCount ? pick : stonesOnSheet.length === 0 ? FIRST_STONE : null;
  const target = paperSelected ?? (classicSelected === null ? null : coordsOf(classicSelected));
  const selectedRefusal = paperSelected ? refusalText(rules, paperSelected, t) : "";

  async function submit(attempt: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefusal(null);
    setFailed(null);
    setPick(null);
    setPending(attempt);
    const after = attempt.moveNumber - 1;
    const result = await apiCall<GameView>(`/api/games/${gameId}/moves`, {
      body: attempt,
    });
    inFlight.current = false;
    setPending(null);
    if (result.ok) {
      onState(result.data, after);
      return;
    }
    const { code } = result.error;
    if (code === "NOT_FOUND") onGone();
    else if (refusalOf(code)) {
      setRefusal(t(`field.refusals.${refusalOf(code)!}`));
      onRefresh();
    } else {
      // The same move is sent again with the same number: the server answers a repeat with 200 (Q4).
      setFailed({ attempt, message: t(code === "network" ? "shared.network" : "field.moveFailed") });
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
      setRefusal(t("field.refusals.GAME_FINISHED"));
      onRefresh();
    } else {
      setResignError(t(code === "network" ? "shared.network" : "field.resignFailed"));
    }
  }

  function onCellSelect(cell: number) {
    onPointSelect(coordsOf(cell));
  }

  function onPointSelect({ x, y }: { x: number; y: number }) {
    // A mouse places the stone at once. On touch only "Postaw kamień" sends a move (issue 181): a tap selects or moves
    // the selection, and tapping the selected intersection again changes nothing.
    if (!touch) void submit({ x, y, moveNumber: game.moveCount + 1 });
    else {
      setRefusal(null);
      setFailed(null);
      setPick({ x, y, moveCount: game.moveCount });
    }
  }

  // The clock that runs: the player's on turn, and while the automat plays for one player the other's, without a break.
  const myClockRuns = !finished && (myTurn || paper?.autoSeat === 3 - game.you.seat);
  const otherClockRuns = !finished && !myClockRuns;
  const pendingCell = pending ? cellOf(pending.x, pending.y) : undefined;
  const stones = pendingCell === undefined ? stonesOf(game.moves) : [...stonesOf(game.moves), { cell: pendingCell, color: myColor }];
  const sheetStones = pending && paper ? [...stonesOnSheet, { x: pending.x, y: pending.y, seat: game.you.seat, auto: false }] : stonesOnSheet;
  const status = busy
    ? t("field.sending")
    : myTurn
      ? t("field.yourTurn", { side: words.name[myColor] })
      : paper?.autoSeat === game.you.seat
        ? t("field.automatForYou")
        : autoTurn
          ? t("field.automatMoves")
          : bot
            ? t("field.botThinking")
            : t("field.opponentTurn");
  const scoreOf = (seat: 1 | 2) => t("shared.score", { score: paper!.scores[seat - 1]! });
  const autoNote = (seat: 1 | 2) => (paper?.autoSeat === seat ? t("shared.automat") : "");
  const nameWith = (name: ReturnType<typeof playerNameOf>, seat: 1 | 2, you = false) => (
    <>
      {paper && <PaperMark framed color={colorOfSeat(game.blackSeat, seat)!} label={words.name[colorOfSeat(game.blackSeat, seat)!]} className="mr-1" />}
      <PlayerLabel name={name} you={you} t={common} />
      {paper && (
        <span data-testid={`score-${you ? "mine" : "theirs"}`}>
          {scoreOf(seat)}
          {autoNote(seat)}
        </span>
      )}
    </>
  );

  if ((game.variant as string) !== "classic" && (game.variant as string) !== "paper") {
    // A state of a variant this page does not know (a stale page after a release): do not guess the board.
    return <Alert status="warning" title={t("shared.unknownVariant")} role="alert" />;
  }

  return (
    <>
      <h1 className="m-0 flex min-h-target items-center pl-11 text-lead font-strong sm:pl-0 sm:text-section">{t(finished ? "shared.finishedHeading" : "field.inProgress")}</h1>
      <PublicFlag audience={game.audience} t={t} />
      <CloseAudience gameId={gameId} game={game} onState={onState} onRefresh={onRefresh} onGone={onGone} />
      <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
        {game.fromRematch && guest && !tokenNoticeSeen && (
          // p06.15: the guest holds a new token for the rematch, in the same browser (rematch Q5).
          <Alert status="info" title={t("field.newAccessTitle")} role="status">
            {t("field.newAccessBody")}{" "}
            <Button variant="secondary" onClick={() => setTokenNoticeSeen(true)} data-testid="token-notice-dismiss">
              {t("field.understood")}
            </Button>
          </Alert>
        )}
        {returnNotice && !finished && <Alert status="info" title={returnNotice} role="status" />}
        {/* A finished game is read in the background for an offer: its failed reads are quiet (offline, a sleeping laptop). */}
        {!finished && pollFails > 0 && pollFails < PLAY_POLL_FAILURES_BEFORE_BANNER && (
          <p role="status" className="m-0 text-meta text-text-secondary">
            {t("shared.pollRetry", { attempt: pollFails, max: PLAY_POLL_FAILURES_BEFORE_BANNER })}
          </p>
        )}
        {!finished && pollFails >= PLAY_POLL_FAILURES_BEFORE_BANNER && (
          <Alert status="danger" title={t("shared.pollFailed")}>
            <Button variant="secondary" onClick={onRefresh}>
              {t("shared.checkNow")}
            </Button>
          </Alert>
        )}
        {outcome ? (
          <GameResultBanner result={outcome.result} title={outcome.title}>
            {outcome.detail}
          </GameResultBanner>
        ) : paper ? (
          <TurnStatus marker={<PaperMark framed color={colorOfSeat(game.blackSeat, game.turnSeat!)!} />}>{status}</TurnStatus>
        ) : (
          <TurnStatus color={colorOfSeat(game.blackSeat, game.turnSeat!)!}>{status}</TurnStatus>
        )}
        {finished && guest && (
          // p06.6: the guest token works for an hour after the end (BR-22).
          <p className="m-0 text-body text-text-secondary" data-testid="guest-until">
            {t("field.guestUntil")}
          </p>
        )}
        {finished && reopened && (
          // p06.5: back on a finished game; nothing can be played.
          <p role="status" className="m-0 text-body text-text-secondary" data-testid="reload-note">
            {t("field.reloaded")}
          </p>
        )}
        <span role="status" className="sr-only" data-testid="low-live">
          {announced ? t(paper ? "field.paperLowTime" : "field.lowTime") : ""}
        </span>
        <GameClock
          name={nameWith(playerNameOf(other, common), (3 - game.you.seat) as 1 | 2)}
          remainingMs={clocks.remainingMs[2 - game.you.seat]!}
          active={otherClockRuns}
          activeLabel={t("field.opponentTurn")}
          timeControlMs={game.timeControlMs}
        />
        {paper ? (
          <PaperBoard
            stones={sheetStones}
            colors={paperColors(game.blackSeat)}
            fives={paper.fives}
            lastMove={pending ? { x: pending.x, y: pending.y } : lastPaperMove(paper)}
            opponentMove={opponentPaperMove(paper, game.you.seat)}
            selection={touch && paperSelected && !busy ? paperSelected : undefined}
            selectionSeat={game.you.seat}
            onSelect={onPointSelect}
            allowed={rules.allowed}
            disabled={!myTurn || busy}
            labels={paperLabelsOf(t)}
            layout={touch ? "phone" : "desktop"}
            toolbar={!touch}
            recenterToken={`${sheetStones.filter((stone) => stone.seat === game.you.seat).length}:${recentered}`}
          />
        ) : (
          <Board
            label={t("shared.boardLabel")}
            cellLabel={cellLabelOf(t)}
            stones={stones}
            lastMove={pendingCell ?? lastMove}
            winLine={game.result?.winLine ?? undefined}
            selected={touch && classicSelected !== null && !busy ? { cell: classicSelected, color: myColor } : undefined}
            readOnly={!myTurn || busy}
            onCellSelect={onCellSelect}
          />
        )}
        {!paper && myTurn && lastMove !== undefined && (
          // The opponent's stone appears on its own; a screen reader hears where (visually hidden).
          <p role="status" className="sr-only" data-testid="opponent-move">
            {opponentMoveText(lastMove, t)}
          </p>
        )}
        {touch && !finished && (
          <div className="flex flex-col items-start gap-group">
            {/* LUKA D01: no pattern for "selected intersection + confirm"; the Board's `selected` and a Button stand in. */}
            <div className="flex flex-wrap items-center gap-group">
              <Button
                disabled={target === null || busy || selectedRefusal !== ""}
                onClick={() => void submit({ x: target!.x, y: target!.y, moveNumber: game.moveCount + 1 })}
              >
                {placeLabel}
              </Button>
              {paper && (
                <Button variant="secondary" onClick={() => setRecentered((count) => count + 1)} data-testid="paper-recenter">
                  {t("field.recenter")}
                </Button>
              )}
            </div>
            <p role="status" className="m-0 text-meta text-text-secondary" data-testid="selection">
              {paperSelected
                ? selectedRefusal || t("field.paperSelected", { x: paperSelected.x - 50, y: paperSelected.y - 50, place: placeLabel })
                : classicSelected !== null
                  ? t("field.classicSelected", { cell: cellName(classicSelected, t), place: placeLabel })
                  : myTurn
                    ? t(paper ? "field.paperHint" : "field.classicHint")
                    : t(autoTurn || paper?.autoSeat === game.you.seat ? "field.waitAutomat" : "field.waitOpponent")}
            </p>
          </div>
        )}
        {refusal && <Alert status="warning" title={refusal} role="status" />}
        {failed && (
          <Alert status="danger" title={failed.message}>
            <Button variant="secondary" onClick={() => void submit(failed.attempt)}>
              {t("shared.retry")}
            </Button>
          </Alert>
        )}
        {guest && !finished && (
          // p05.11: permanent for a guest (BR-22) while the game is played. Under the action block, not above the board,
          // so it does not push "Postaw kamień" out of the first screen on a phone (issue 181).
          <Alert status="warning" title={t("shared.guestWarningTitle")}>
            {t("shared.guestWarningBody")}
          </Alert>
        )}
        {game.moveCount === 0 && !finished && (
          // L15: the draw is announced at the start only; the line under the board stays.
          <Alert
            status="info"
            title={
              game.fromRematch
                ? t("field.drawnRematch", { swapped: words.rematchSwapped, plays: words.plays[myColor] })
                : t("field.drawn", { plays: words.plays[myColor] })
            }
            role="status"
          />
        )}
        <GameClock
          name={nameWith(playerNameOf(mine, common), game.you.seat, true)}
          remainingMs={clocks.remainingMs[game.you.seat - 1]!}
          active={myClockRuns}
          activeLabel={t("field.yourClock")}
          timeControlMs={game.timeControlMs}
        />
        <p className="m-0 text-body text-text-secondary" data-testid="my-color">
          {t(finished ? "field.youPlayed" : "field.youPlay", { plays: words.plays[myColor] })}
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
                  {t("field.resign")}
                </Button>
              }
              title={t("field.resignTitle")}
              description={
                <>
                  {resignError && (
                    <span role="alert" className="mb-group block font-strong text-status-danger">
                      {resignError}
                    </span>
                  )}
                  {t("field.resignBody")}
                </>
              }
              confirmLabel={t(resigning ? "field.resigning" : resignError ? "shared.retry" : "field.resign")}
              cancelLabel={t("field.backToGame")}
              confirming={resigning}
              onConfirm={() => void resign()}
            />
          </div>
        )}
        {finished &&
          (bot ? (
            // R13: no rematch with the bot, a new game at the same level instead.
            <BotReplay level={bot.bot!.level} guest={guest} nickname={guestNickname(game.you.kind, mine?.displayName, game.you.seat)} />
          ) : (
            // D06: no component for the actions after the end; the block is built from Alert and Button.
            <RematchPanel gameId={gameId} game={game} reopened={reopened ?? false} onState={onState} onRefresh={onRefresh} onAccepting={onAccepting} onGone={onGone} />
          ))}
        {/* Under the controls, so it never pushes the board or its button off the first screen on a phone. */}
        <PublicGameQr gameId={gameId} audience={game.audience} t={t} />
        {/* E07-S01: under the controls and, on the result screen, under the rematch block, so it never pushes the main action down. */}
        {/* The bot does not chat (R14): a game with it has no chat panel at all. */}
        {!bot && <ChatPanel gameId={gameId} game={game} onGone={onGone} />}
      </div>
    </>
  );
}
