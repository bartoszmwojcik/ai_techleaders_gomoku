"use client";

import type { Locale } from "@gomoku/core/i18n/locales";
import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { Checkbox } from "@gomoku/ui/game/checkbox";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import { TextLink } from "@gomoku/ui/game/text-link";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { GameClock } from "@/components/games/game-clock";
import { useGameClock } from "@/components/games/use-game-clock";
import type { NamespaceDict } from "@/i18n/catalogs/types";
import { apiCall } from "@/lib/api-client";
import { colorOfSeat, knownMoves, mergeState, stonesOf } from "@/lib/games/play";
import { cellLabelOf, readStoredProjector, seatName, showTranslator, storeProjector, type ShowDict, type ShowTranslator } from "@/lib/show/texts";
import type { ShowView } from "@/server/http/show-view";

import { EndShowButton } from "../end-show-button";

type Props = {
  gameId: string;
  initial: ShowView;
  /** `?projektor=` read by the page: `true`/`false` when the address says so, `null` when it says nothing. */
  projector: boolean | null;
  locale?: Locale;
  dict?: ShowDict;
  /** The `header` namespace for "Wyloguj"; Polish by default. */
  headerDict?: NamespaceDict<"header">;
};

/**
 * `/show/[gameId]` (show-mode, phase a): the board, both clocks with the bots' names and colours, whose turn it is and
 * the result, read only. Nothing moves the bots in this phase, so the view reads once and on "Odśwież" (and when a
 * clock reaches zero). "Widok pod projektor" is a mode of this view: the address carries it, the browser's storage
 * is only the default when the address says nothing.
 */
export function ShowRoom({ gameId, initial, projector: fromAddress, locale, dict, headerDict }: Props) {
  const t = useMemo(() => showTranslator(locale, dict), [locale, dict]);
  const [game, setGame] = useState(initial);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The address decides; without `?projektor=` the browser's last choice is the default (`false` on the server).
  const [chosen, setChosen] = useState<boolean | null>(fromAddress);
  const stored = useSyncExternalStore(subscribeNever, readStoredProjector, () => false);
  const projector = chosen ?? stored;
  const [announcement, setAnnouncement] = useState("");
  const latest = useRef(initial);
  const reading = useRef(false);

  // A default taken from storage is written back to the address, which stays the source of truth on a reload.
  useEffect(() => {
    if (chosen === null && stored) writeAddress(true);
  }, [chosen, stored]);

  function toggleProjector(on: boolean) {
    setChosen(on);
    storeProjector(on);
    writeAddress(on);
    setAnnouncement(on ? t("room.projectorOn") : t("room.projectorOff"));
  }

  async function refresh() {
    if (reading.current) return;
    reading.current = true;
    setRefreshing(true);
    const after = knownMoves(latest.current);
    const result = await apiCall<ShowView>(`/api/show/${gameId}?after=${after}`, { method: "GET" });
    reading.current = false;
    setRefreshing(false);
    if (result.ok) {
      setFailed(false);
      latest.current = mergeState(latest.current, result.data, after);
      setGame(latest.current);
    } else if (result.error.code === "NOT_FOUND") {
      setGone(true);
    } else {
      setFailed(true);
    }
  }

  function ended(state: ShowView | null) {
    if (!state) return void refresh();
    latest.current = state;
    setGame(state);
  }

  const open = game.status === "active" || game.status === "waiting";
  // Only the server decides that the time is up: when the running clock reaches zero, it is asked at once.
  const clocks = useGameClock(game.clock, { finished: game.status !== "active", onExpire: () => void refresh() });

  if (gone) {
    return (
      <Shell projector={false}>
        <ErrorState
          title={t("room.goneTitle")}
          action={
            <TextLink href="/show" placement="standalone">
              {t("room.goneAction")}
            </TextLink>
          }
        >
          {t("room.goneBody")}
        </ErrorState>
      </Shell>
    );
  }

  // The seats are listed in order; the clocks go by colour, black first.
  const seats = game.blackSeat === 2 ? [...game.players].reverse() : game.players;
  const nameOf = (seat: number | null) => {
    const player = game.players.find((each) => each.seat === seat);
    return player ? seatName(t, player) : "";
  };

  const heading = (
    <>
      <h1 className="m-0 text-section font-strong">
        {open ? t("room.title", { layout: t(`layout.${game.layout}`) }) : t("room.finishedTitle")}
      </h1>
      <Checkbox checked={projector} onCheckedChange={(state) => toggleProjector(state === true)} label={t("room.projector")} data-testid="show-projector" />
      <p aria-live="polite" className="sr-only" data-testid="show-announcement">
        {announcement}
      </p>
      {game.status === "active" && <Alert status="info" title={t("room.noDrive")} />}
      <Status game={game} t={t} nameOf={nameOf} />
    </>
  );
  const board = (
    <Board
      label={t("board.label")}
      cellLabel={cellLabelOf(t)}
      stones={stonesOf(game.moves)}
      lastMove={game.moves.at(-1)}
      winLine={game.result?.winLine ?? undefined}
      readOnly
      className={projector ? "max-w-(--layout-width-board-show) shrink-0" : undefined}
    />
  );
  const rest = (
    <>
      {seats.map((player) => {
        const color = colorOfSeat(game.blackSeat, player.seat);
        const name = seatName(t, player);
        return (
          <GameClock
            key={player.seat}
            name={<span className={projector ? "text-lead" : undefined}>{color ? t(`room.side.${color}`, { name }) : name}</span>}
            remainingMs={clocks.remainingMs[player.seat - 1]!}
            active={game.status === "active" && game.turnSeat === player.seat}
            activeLabel={t("room.clockActive")}
            timeControlMs={game.timeControlMs}
            className={projector ? "[&_time]:text-title" : undefined}
          />
        );
      })}
      {failed && <Alert status="danger" role="alert" title={t("room.refreshFailed")} />}
      <div className="flex flex-wrap items-start gap-stack">
        <Button variant="secondary" loading={refreshing} onClick={() => void refresh()} data-testid="show-refresh">
          {t("room.refresh")}
        </Button>
        {open ? (
          <EndShowButton gameId={gameId} t={t} onEnded={ended} />
        ) : (
          <>
            <Button asChild variant="secondary">
              <Link href="/show">{t("room.newShow")}</Link>
            </Button>
            <LogoutButton dict={headerDict} />
          </>
        )}
      </div>
    </>
  );

  // The normal view is one column; the projector view puts the board first and everything else beside it, so the
  // whole board fits the screen (P20).
  return (
    <Shell projector={projector}>
      {projector ? (
        <div data-testid="show-stage" data-projector="true" className="flex flex-col gap-stack lg:flex-row lg:items-start">
          {board}
          <div className="flex min-w-0 flex-1 flex-col gap-stack">
            {heading}
            {rest}
          </div>
        </div>
      ) : (
        <>
          {heading}
          <div data-testid="show-stage" className="flex max-w-(--layout-width-board) flex-col gap-stack">
            {board}
            {rest}
          </div>
        </>
      )}
    </Shell>
  );
}

function Status({ game, t, nameOf }: { game: ShowView; t: ShowTranslator; nameOf: (seat: number | null) => string }) {
  if (game.status === "cancelled") {
    return <Alert status="warning" role="status" title={game.closedReason === "expired" ? t("room.expired") : t("room.ended")} />;
  }
  if (game.result) {
    const { winnerSeat, reason } = game.result;
    const color = winnerSeat === null ? null : colorOfSeat(game.blackSeat, winnerSeat);
    return (
      <GameResultBanner result={color ? "win" : "draw"} title={color ? t(`room.wins.${color}`, { name: nameOf(winnerSeat) }) : t("room.draw")}>
        {t(`room.reason.${reason}`)}
      </GameResultBanner>
    );
  }
  const color = game.turnSeat === null ? null : colorOfSeat(game.blackSeat, game.turnSeat);
  if (!color) return null;
  return <TurnStatus color={color}>{t(`room.turn.${color}`, { name: nameOf(game.turnSeat) })}</TurnStatus>;
}

/** Storage is read once per render; another tab's choice does not move this view. */
function subscribeNever(): () => void {
  return () => undefined;
}

/** The address carries the mode (P20): replaced in place, without a reload or a request to the server. */
function writeAddress(on: boolean) {
  const url = new URL(window.location.href);
  url.searchParams.set("projektor", on ? "1" : "0");
  window.history.replaceState(window.history.state, "", url);
}

function Shell({ projector, children }: { projector: boolean; children: React.ReactNode }) {
  return (
    <main
      className={`mx-auto flex w-full flex-1 flex-col gap-stack px-panel py-section ${projector ? "" : "max-w-(--layout-width-dialog)"}`}
    >
      {children}
    </main>
  );
}
