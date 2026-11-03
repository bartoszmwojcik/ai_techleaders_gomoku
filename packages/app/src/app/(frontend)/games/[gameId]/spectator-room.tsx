"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { PaperBoard } from "@gomoku/ui/game/paper-board";
import { PaperMark } from "@gomoku/ui/game/paper-mark";
import { Button } from "@gomoku/ui/game/button";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import { TextLink } from "@gomoku/ui/game/text-link";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import type { Seat } from "@gomoku/core/games/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { SpectatorChat } from "@/components/chat/spectator-chat";
import { AudienceClosedScreen } from "@/components/games/audience-closed";
import { GameClock } from "@/components/games/game-clock";
import { PlayerLabel } from "@/components/games/player-label";
import { PublicFlag } from "@/components/games/public-flag";
import { useGameClock } from "@/components/games/use-game-clock";
import { usePageVisibility } from "@/components/games/use-page-visibility";
import { apiCall } from "@/lib/api-client";
import { lastPaperMove, PAPER_LABELS, paperColors } from "@/lib/games/paper";
import { cellLabel, colorOfSeat, knownMoves, mergeState, paperStonesOf, playerNameOf, sideWords, stonesOf } from "@/lib/games/play";
import { neutralOutcomeOf } from "@/lib/games/review";
import { SPECTATOR_FAILURES_BEFORE_BANNER, spectatorPollDelay } from "@/lib/games/spectate";
import type { SpectatorView } from "@/server/http/spectator-view";

/** A read that takes longer is abandoned, so one hung request cannot stop the polling for good. */
export const SPECTATOR_POLL_TIMEOUT_MS = 8000;

type Props = {
  gameId: string;
  initial: SpectatorView;
};

/**
 * `/games/[gameId]` for a spectator of a public game (E10-S02, BR-39): the board, both clocks, whose
 * turn it is and the result, read-only. It polls `GET /api/games/[id]/spectate` every 2 s (slower when
 * nobody moves, not at all in a hidden tab or after the end) and sends nothing but chat messages
 * (`SpectatorChat`, E10-S03): there is no move, resignation, rematch or chat switch here. The clocks count down against the server's time
 * (`useGameClock`), so a wrong device clock changes nothing.
 */
export function SpectatorRoom({ gameId, initial }: Props) {
  const [game, setGame] = useState(initial);
  const [gone, setGone] = useState(false);
  // The creator closed the audience (BR-43): the board and the chat are gone for good.
  const [closed, setClosed] = useState(false);
  const [fails, setFails] = useState(0);
  // The newest state, so a poll asks only for the moves it does not know yet (`?after=`).
  const latest = useRef(initial);
  const polling = useRef(false);
  // When the last move was seen, on the browser's monotonic clock: the pace slows after a quiet minute.
  const movedAt = useRef<number | null>(null);
  // Restarts the polling timer (after coming back to the tab), set by the polling effect.
  const reschedule = useRef<(() => void) | null>(null);

  const read = useCallback(async () => {
    const after = knownMoves(latest.current);
    // One controller for the timeout; a hung read ends as a failed one.
    const controller = new AbortController();
    AbortSignal.timeout(SPECTATOR_POLL_TIMEOUT_MS).addEventListener("abort", () => controller.abort(), { once: true });
    const result = await apiCall<SpectatorView>(`/api/games/${gameId}/spectate?after=${after}`, {
      method: "GET",
      signal: controller.signal,
    });
    if (result.ok) {
      setFails(0);
      const merged = mergeState(latest.current, result.data, after);
      if (merged.moveCount !== latest.current.moveCount) movedAt.current = performance.now();
      latest.current = merged;
      setGame(merged);
    } else if (result.error.code === "NOT_FOUND") {
      setGone(true);
    } else if (result.error.code === "AUDIENCE_CLOSED") {
      setClosed(true);
    } else {
      setFails((count) => count + 1);
    }
  }, [gameId]);

  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      await read();
    } finally {
      polling.current = false;
    }
  }, [read]);

  // A hidden tab does not poll; coming back reads the state at once.
  const hidden = usePageVisibility({
    onReturn: () => {
      if (gone || latest.current.status !== "active") return;
      reschedule.current?.();
      void poll();
    },
  });
  const needsPolling = !gone && !closed && !hidden && game.status === "active";

  useEffect(() => {
    if (!needsPolling) return;
    movedAt.current ??= performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // The next read is planned when the previous one is over: its answer (a move) decides the pace.
    const schedule = () => {
      clearTimeout(timer);
      if (stopped) return;
      const delay = spectatorPollDelay(latest.current.status, performance.now() - movedAt.current!);
      if (delay === null) return;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, delay);
    };
    reschedule.current = schedule;
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      reschedule.current = null;
    };
  }, [needsPolling, poll]);

  const finished = game.status === "finished";
  // Only the server decides that the time is up: when the running clock reaches zero, it is asked at once.
  const clocks = useGameClock(game.clock, { finished: game.status !== "active", onExpire: () => void poll() });

  if (closed) return <AudienceClosedScreen />;

  if (gone) {
    return (
      <Shell>
        <ErrorState
          title="Oglądanie wygasło albo partii już nie ma"
          action={
            <TextLink href="/join" placement="standalone">
              Masz kod? Wpisz go ponownie
            </TextLink>
          }
        >
          Dostęp widza trwa godzinę od ostatniego odczytu, a partia znika po zakończeniu.
        </ErrorState>
      </Shell>
    );
  }

  if (game.status === "cancelled") {
    return (
      <Shell>
        <h1 className="m-0 text-section font-strong">Partia anulowana</h1>
        <Alert status="warning" title="Partię anulowano: nie została rozegrana." />
        <TextLink href="/" placement="standalone">
          Wróć na stronę główną
        </TextLink>
      </Shell>
    );
  }

  // The server lists the seats in order; the clocks go by colour, black first.
  const seats = game.blackSeat === 2 ? [...game.players].reverse() : game.players;
  const outcome = game.result ? neutralOutcomeOf({ result: game.result, blackSeat: game.blackSeat!, players: game.players, variant: game.variant }) : null;
  const lastMove = game.moves.at(-1);
  const paper = game.paper;
  const words = sideWords(game.variant);
  const turnText = () =>
    `Ruch ${words.genitive[colorOfSeat(game.blackSeat, game.turnSeat!)!]}: ${playerNameOf(game.players.find((player) => player.seat === game.turnSeat)).label}`;

  if ((game.variant as string) !== "classic" && (game.variant as string) !== "paper") {
    // A variant this page does not know (a stale page after a release): do not guess the board.
    return (
      <Shell>
        <Alert status="warning" title="Ta partia jest w wariancie, którego ta wersja strony nie obsługuje. Odśwież stronę." role="alert" />
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="m-0 text-section font-strong">{finished ? "Koniec partii" : "Oglądasz partię"}</h1>
      <Alert status="info" title="Jesteś widzem — oglądasz partię bez wpływu na jej przebieg." />
      <PublicFlag audience={game.audience} />
      {!finished && fails > 0 && fails < SPECTATOR_FAILURES_BEFORE_BANNER && (
        <p role="status" className="m-0 text-meta text-text-secondary">
          Ponawiamy sprawdzanie stanu partii (próba {fails} z {SPECTATOR_FAILURES_BEFORE_BANNER}).
        </p>
      )}
      {!finished && fails >= SPECTATOR_FAILURES_BEFORE_BANNER && (
        <Alert status="danger" title="Nie udało się sprawdzić stanu partii. Ponawiamy próby.">
          <Button variant="secondary" onClick={() => void poll()}>
            Sprawdź teraz
          </Button>
        </Alert>
      )}
      {outcome ? (
        <GameResultBanner result={outcome.result} title={outcome.title}>
          {outcome.detail}
        </GameResultBanner>
      ) : paper ? (
        // An unfinished game that is not void is in progress: a turn is set (CHECKs of `games`).
        <TurnStatus marker={<PaperMark framed color={colorOfSeat(game.blackSeat, game.turnSeat!)!} />}>{turnText()}</TurnStatus>
      ) : (
        <TurnStatus color={colorOfSeat(game.blackSeat, game.turnSeat!)!}>{turnText()}</TurnStatus>
      )}
      <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
        {seats.map((player) => (
          <GameClock
            key={player.seat}
            name={<ColorName player={player} blackSeat={game.blackSeat} variant={game.variant} score={paper?.scores[player.seat - 1]} auto={paper?.autoSeat === player.seat} />}
            remainingMs={clocks.remainingMs[player.seat - 1]!}
            active={!finished && (paper ? game.clock.running : game.turnSeat) === player.seat}
            activeLabel="Ruch"
            timeControlMs={game.timeControlMs}
          />
        ))}
        {paper ? (
          <PaperBoard
            stones={paperStonesOf(paper)}
            colors={paperColors(game.blackSeat)}
            fives={paper.fives}
            lastMove={lastPaperMove(paper)}
            disabled
            labels={PAPER_LABELS}
          />
        ) : (
          <Board
            label="Plansza 15 na 15"
            cellLabel={cellLabel}
            stones={stonesOf(game.moves)}
            lastMove={lastMove}
            winLine={game.result?.winLine ?? undefined}
            readOnly
          />
        )}
      </div>
      <SpectatorChat gameId={gameId} players={game.players} canWrite={game.canChat} onGone={() => void read()} />
      <TextLink href="/" placement="standalone">
        Wróć na stronę główną
      </TextLink>
    </Shell>
  );
}

function ColorName({
  player,
  blackSeat,
  variant,
  score,
  auto,
}: {
  player: SpectatorView["players"][number];
  blackSeat: Seat | null;
  variant: SpectatorView["variant"];
  /** Points of the paper game; `undefined` in the classic one. */
  score?: number | undefined;
  auto?: boolean | undefined;
}) {
  const color = colorOfSeat(blackSeat, player.seat);
  const words = sideWords(variant);
  return (
    <>
      {color && variant === "paper" && <PaperMark framed color={color} className="mr-1" />}
      {color && `${words.title[color]}: `}
      <PlayerLabel name={playerNameOf(player)} />
      {score !== undefined && ` · punkty: ${score}`}
      {auto && " · Automat"}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full flex-1 max-w-(--layout-width-dialog) flex-col gap-stack px-panel py-section">{children}</main>;
}
