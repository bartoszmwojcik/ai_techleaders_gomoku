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
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { GameClock } from "@/components/games/game-clock";
import { useGameClock } from "@/components/games/use-game-clock";
import type { NamespaceDict } from "@/i18n/catalogs/types";
import { apiCall } from "@/lib/api-client";
import { colorOfSeat, knownMoves, mergeState, stonesOf } from "@/lib/games/play";
import { cellLabelOf, readStoredProjector, seatName, showTranslator, storeProjector, type ShowDict, type ShowTranslator } from "@/lib/show/texts";
import type { ShowView } from "@/server/http/show-view";

import { EndShowButton } from "../end-show-button";
import { AgentCard } from "./agent-card";
import { DriveIndicator } from "./drive-indicator";
import { useShowDrive, type DriveRead } from "./use-show-drive";

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
 * `/show/[gameId]` (show-mode, phases a-c): the board, both clocks with the bots' names and colours, whose turn it is
 * and the result, read only. The view is the show's drive: it keeps reading the show (`useShowDrive`), and every read
 * with a bot on turn makes the server play that bot's move; the indicator above the board says when the drive
 * stopped. A bot vs agent show waiting for its agent shows the card with the code (`AgentCard`). "Widok pod projektor" is a mode of this view: the address carries it, the browser's storage is only the
 * default when the address says nothing.
 */
export function ShowRoom({ gameId, initial, projector: fromAddress, locale, dict, headerDict }: Props) {
  const t = useMemo(() => showTranslator(locale, dict), [locale, dict]);
  const [game, setGame] = useState(initial);
  const [gone, setGone] = useState(false);
  // The address decides; without `?projektor=` the browser's last choice is the default (`false` on the server).
  const [chosen, setChosen] = useState<boolean | null>(fromAddress);
  const stored = useSyncExternalStore(subscribeNever, readStoredProjector, () => false);
  const projector = chosen ?? stored;
  const [announcement, setAnnouncement] = useState("");
  const latest = useRef(initial);

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

  const read = useCallback(
    async (signal: AbortSignal): Promise<DriveRead> => {
      const after = knownMoves(latest.current);
      const result = await apiCall<ShowView>(`/api/show/${gameId}?after=${after}`, { method: "GET", signal });
      if (result.ok) {
        latest.current = mergeState(latest.current, result.data, after);
        setGame(latest.current);
        return { ok: true, botOnTurn: latest.current.drive.botOnTurn, open: isOpen(latest.current) };
      }
      if (result.error.code === "NOT_FOUND") setGone(true);
      return { ok: false, gone: result.error.code === "NOT_FOUND" };
    },
    [gameId],
  );

  const open = isOpen(game);
  const drive = useShowDrive({ open: open && !gone, botOnTurn: initial.drive.botOnTurn, serverStalled: game.drive.stalled, read });

  function ended(state: ShowView | null) {
    if (!state) return drive.check();
    latest.current = state;
    setGame(state);
  }

  // Only the server decides that the time is up: when the running clock reaches zero, it is asked at once.
  const clocks = useGameClock(game.clock, { finished: game.status !== "active", onExpire: drive.check });

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
  // Only called for a seat the server named (on turn, the winner), which is always among the players.
  const nameOf = (seat: number) => seatName(t, game.players.find((each) => each.seat === seat)!);

  const heading = (
    <>
      <h1 className="m-0 text-section font-strong">
        {open ? t("room.title", { layout: t(`layout.${game.layout}`) }) : t("room.finishedTitle")}
      </h1>
      <Checkbox checked={projector} onCheckedChange={(state) => toggleProjector(state === true)} label={t("room.projector")} data-testid="show-projector" />
      <p aria-live="polite" className="sr-only" data-testid="show-announcement">
        {announcement}
      </p>
      <DriveIndicator
        status={drive.status}
        clockMs={game.status === "active" && game.turnSeat !== null ? clocks.remainingMs[game.turnSeat - 1]! : null}
        checking={drive.checking}
        onCheck={drive.check}
        t={t}
      />
      <Status game={game} t={t} nameOf={nameOf} />
      {game.status === "waiting" && game.invitation && (
        <AgentCard invitation={game.invitation} serverNow={game.clock.now} t={t} onExpire={drive.check} />
      )}
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
      <div className="flex flex-wrap items-start gap-stack">
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
  // whole board fits the screen (P20). The tree keeps its shape, so the switch keeps the focus when it is toggled.
  return (
    <Shell projector={projector}>
      <div
        data-testid="show-stage"
        data-projector={projector || undefined}
        className={projector ? "flex flex-col gap-stack lg:flex-row lg:items-start" : "flex max-w-(--layout-width-board) flex-col gap-stack"}
      >
        {projector && board}
        <div className="flex min-w-0 flex-1 flex-col gap-stack">
          {heading}
          {!projector && board}
          {rest}
        </div>
      </div>
    </Shell>
  );
}

function Status({ game, t, nameOf }: { game: ShowView; t: ShowTranslator; nameOf: (seat: number) => string }) {
  if (game.status === "cancelled") {
    return <Alert status="warning" role="status" title={game.closedReason === "expired" ? t("room.expired") : t("room.ended")} />;
  }
  if (game.result) {
    const { winnerSeat, reason } = game.result;
    const color = winnerSeat === null ? null : colorOfSeat(game.blackSeat, winnerSeat);
    return (
      <GameResultBanner result={color ? "win" : "draw"} title={color ? t(`room.wins.${color}`, { name: nameOf(winnerSeat!) }) : t("room.draw")}>
        {t(`room.reason.${reason}`)}
      </GameResultBanner>
    );
  }
  const color = game.turnSeat === null ? null : colorOfSeat(game.blackSeat, game.turnSeat);
  if (!color) return null;
  return <TurnStatus color={color}>{t(`room.turn.${color}`, { name: nameOf(game.turnSeat!) })}</TurnStatus>;
}

/** The show is still open: the drive reads it and the administrator may end it. */
function isOpen(game: Pick<ShowView, "status">): boolean {
  return game.status === "active" || game.status === "waiting";
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
      className={`mx-auto flex w-full flex-1 flex-col gap-stack px-panel ${projector ? "py-stack" : "max-w-(--layout-width-dialog) py-section"}`}
    >
      {children}
    </main>
  );
}
