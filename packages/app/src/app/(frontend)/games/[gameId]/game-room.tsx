"use client";

import { isReturnNoticeFresh } from "@gomoku/core/games/return-notice";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { InviteCodeCard } from "@gomoku/ui/game/invite-code-card";
import { PlayerClock } from "@gomoku/ui/game/player-clock";
import { formatClock } from "@gomoku/ui/game/format-clock";
import { TextLink } from "@gomoku/ui/game/text-link";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { CreateGameButton } from "@/components/games/create-game-button";
import { DismissibleNotice } from "@/components/games/dismissible-notice";
import { GameGate } from "@/components/games/game-gate";
import { PlayerLabel } from "@/components/games/player-label";
import { PlayField } from "@/components/games/play-field";
import { usePageVisibility } from "@/components/games/use-page-visibility";
import { apiCall } from "@/lib/api-client";
import { mergeState, playerName, playerNameOf } from "@/lib/games/play";
import type { GameView } from "@/server/http/game-view";

/** Polling of a waiting game (#21 Q6): short polling every 3 s until a transport from #30 exists. */
export const POLL_INTERVAL_MS = 3000;
/** Polling of a game in progress (#22 Q5): the opponent's move is read every 2 s. */
export const PLAY_POLL_INTERVAL_MS = 2000;
/** "Przeciwnik dołączył" stays this long before the page moves on (A-04 of the prototype). */
export const JOIN_STEP_MS = 2500;
/** Failed polls in a row before the banner appears (L02). */
export const POLL_FAILURES_BEFORE_BANNER = 3;

/** A read that takes longer is abandoned, so one hung request cannot stop the polling for good. */
export const POLL_TIMEOUT_MS = 8000;

/** "Wróciłeś do partii" disappears by itself after this long (A-20 of the prototype), or with the next move. */
export const RETURN_NOTICE_MS = 8000;

const TEN_MINUTES_MS = 10 * 60 * 1000;

type Props = {
  gameId: string;
  initial: GameView;
  /** The player pressed "Utwórz zaproszenie" while already waiting in this game (L01). */
  ownWaitingNotice: boolean;
};

type Copy = "idle" | "ok" | "fail" | "share-fail";

const COPY_FEEDBACK: Record<Exclude<Copy, "idle">, string> = {
  ok: "Skopiowano link do schowka.",
  fail: "Nie można skopiować automatycznie. Link jest zaznaczony — skopiuj go ręcznie (Ctrl+C).",
  "share-fail": "Nie udało się otworzyć udostępniania. Skopiuj link ręcznie.",
};

const VALID_UNTIL_ZONE = "Europe/Warsaw";
const validUntilFormat = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: VALID_UNTIL_ZONE,
});
// The zone abbreviation comes from en-GB, which prints "CET"/"CEST" (en-US would print "GMT+1"), so it
// is correct in both seasons and identical on the server and in the browser.
const validUntilZone = new Intl.DateTimeFormat("en-GB", { timeZone: VALID_UNTIL_ZONE, timeZoneName: "short" });

/** "wtorek 27 października, 10:00 CET": a fixed zone, so the server and the browser print the same text. */
export function formatValidUntil(iso: string): string {
  const date = new Date(iso);
  const zone = validUntilZone.formatToParts(date).find((part) => part.type === "timeZoneName")!.value;
  return `${validUntilFormat.format(date)} ${zone}`;
}

// `navigator.share` exists only in some browsers; the server cannot know, so the first render says no.
const subscribeNothing = () => () => {};
const canShareNow = () => typeof navigator.share === "function";
const cannotShareOnServer = () => false;

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full flex-1 max-w-(--layout-width-dialog) flex-col gap-stack px-panel py-section">
      {children}
    </main>
  );
}

/**
 * `/games/[gameId]` while the game is not played yet: the creator's wait (p03), the ready
 * state (p04), the cancelled and expired ends (p03.9, p04.3) and the errors of the polling.
 * Once both players opened the page the board takes over (p05, p06: `PlayField`); this component
 * polls the state and merges it, `PlayField` shows it and sends the moves.
 */
export function GameRoom({ gameId, initial, ownWaitingNotice }: Props) {
  const router = useRouter();
  const [game, setGame] = useState(initial);
  const [gone, setGone] = useState(false);
  const [fails, setFails] = useState(0);
  const [joinStep, setJoinStep] = useState(false);
  const [copy, setCopy] = useState<Copy>("idle");
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelProblem, setCancelProblem] = useState<ReactNode>(null);
  const canShare = useSyncExternalStore(subscribeNothing, canShareNow, cannotShareOnServer);
  const cardRef = useRef<HTMLDivElement>(null);
  const status = useRef(initial.status);
  // The newest state, so a poll asks only for the moves it does not know yet (`?after=`).
  const latest = useRef(initial);
  const polling = useRef(false);
  // After a long absence the next successful read says "Wróciłeś do partii" (#24 Q2), with the time the server reports.
  const [notice, setNotice] = useState<{ text: string; moveCount: number } | null>(null);
  // When the tab came back after a long absence; set means the notice is due. Cleared once shown, expired or moot.
  const returnedAt = useRef<number | null>(null);
  // The tab came back while a read was in flight; that read may predate the return, so one more follows it.
  const readAgain = useRef(false);
  // State alone lags a double click by one render; the ref closes that gap.
  const cancelInFlight = useRef(false);

  const everyoneSeen = game.players.every((player) => player.seen);
  // `waiting` waits for the opponent; `active` waits for the player who has not opened the page yet (Q20).
  const waitingForOpponent = game.status === "waiting" || (game.status === "active" && !everyoneSeen);
  const playing = game.status === "active" && everyoneSeen;

  // The move just played answers with the new state (`after` = moves known before it).
  const applyState = useCallback((next: GameView, after: number) => {
    const merged = mergeState(latest.current, next, after);
    latest.current = merged;
    status.current = merged.status;
    // The game is over (or void): there is nobody to welcome back.
    if (merged.status !== "waiting" && merged.status !== "active") returnedAt.current = null;
    setGame(merged);
  }, []);

  const markGone = useCallback(() => {
    returnedAt.current = null;
    setGone(true);
  }, []);

  const readOnce = useCallback(async () => {
    const startedAt = Date.now();
    const after = latest.current.moves.length;
    const result = await apiCall<GameView>(`/api/games/${gameId}?after=${after}`, {
      method: "GET",
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    if (result.ok) {
      setFails(0);
      // The creator sees "Przeciwnik dołączył" for a moment before the ready state (p03.5).
      if (status.current === "waiting" && result.data.status === "active") setJoinStep(true);
      applyState(result.data, after);
      // A read that started before the return may carry the time from before the sleep: it waits for the next one.
      if (returnedAt.current !== null && startedAt >= returnedAt.current) {
        const fresh = isReturnNoticeFresh({ returnedAtMs: returnedAt.current, readAtMs: Date.now() });
        returnedAt.current = null;
        const merged = latest.current;
        // A game that ended while the player was away shows its result instead (p06.3).
        if (fresh && merged.status === "active" && merged.players.every((player) => player.seen)) {
          const left = merged.clock.remainingMs[merged.you.seat - 1]!;
          setNotice({ text: `Wróciłeś do partii. Twój zegar: ${formatClock(left)}.`, moveCount: merged.moveCount });
        }
      }
    } else if (result.error.code === "NOT_FOUND") {
      markGone();
    } else {
      setFails((count) => count + 1);
    }
  }, [gameId, applyState, markGone]);

  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    do {
      readAgain.current = false;
      await readOnce();
    } while (readAgain.current);
    polling.current = false;
  }, [readOnce]);

  // A hidden tab does not poll (#22 UI); coming back reads the state at once (#24 Q5).
  const hidden = usePageVisibility({
    onReturn: ({ longAbsence }) => {
      if (gone || (status.current !== "waiting" && status.current !== "active")) return;
      returnedAt.current = longAbsence ? Date.now() : null;
      // A read in flight may predate the return: the one after it is the one that counts.
      if (polling.current) readAgain.current = true;
      else void poll();
    },
  });
  const needsPolling = !gone && !hidden && (waitingForOpponent || playing);

  useEffect(() => {
    if (!needsPolling) return;
    const timer = setInterval(() => void poll(), playing ? PLAY_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [needsPolling, playing, poll]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), RETURN_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!joinStep) return;
    const timer = setTimeout(() => setJoinStep(false), JOIN_STEP_MS);
    return () => clearTimeout(timer);
  }, [joinStep]);

  if (gone) {
    return (
      <Shell>
        <GameGate />
      </Shell>
    );
  }

  const other = game.players.find((player) => player.seat !== game.you.seat);
  const mine = game.players.find((player) => player.seat === game.you.seat);
  const nameOf = playerName;
  const isGuest = game.you.kind === "guest";

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(game.invitation!.url);
      setCopy("ok");
    } catch {
      // p03.3: no Clipboard API (or no permission): the link is selected so the player can copy it by hand.
      const range = document.createRange();
      range.selectNodeContents(cardRef.current!.querySelector("dd")!);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      setCopy("fail");
    }
  }

  async function onShare() {
    setCopy("idle");
    try {
      await navigator.share({ title: "Zaproszenie do partii Gomoku", url: game.invitation!.url });
    } catch (error) {
      // Closing the share sheet is not an error.
      if ((error as { name?: string }).name !== "AbortError") setCopy("share-fail");
    }
  }

  async function onConfirmCancel() {
    if (cancelInFlight.current) return;
    cancelInFlight.current = true;
    setCancelling(true);
    // The previous attempt's message does not outlive a new attempt.
    setCancelProblem(null);
    const result = await apiCall(`/api/games/${gameId}/cancel`);
    if (result.ok) {
      // L04: the creator leaves for the home page, the link is void. Stay busy while navigating.
      router.replace("/?notice=cancelled");
      return;
    }
    cancelInFlight.current = false;
    setCancelling(false);
    setAsking(false);
    const { code } = result.error;
    if (code === "GAME_NOT_CANCELLABLE") {
      // The opponent joined before the cancel (Q9): show the new state, not an error.
      setCancelProblem(
        <Alert status="warning" title="Przeciwnik zdążył dołączyć, zanim anulowałeś">
          Partii nie można już anulować jako zaproszenia.
        </Alert>,
      );
      void poll();
    } else if (code === "NOT_FOUND") {
      markGone();
    } else {
      setCancelProblem(
        <Alert status="danger" title="Nie udało się anulować zaproszenia">
          {code === "network" ? "Nie udało się połączyć z serwerem. " : ""}Spróbuj ponownie.
        </Alert>,
      );
    }
  }

  if (game.status === "cancelled") {
    // `closedReason` tells the endings apart: the creator may have cancelled in another tab or device.
    if (game.closedReason === "cancelled" || game.closedReason === "expired") {
      const ending =
        game.closedReason === "cancelled"
          ? { heading: "Zaproszenie zostało anulowane", details: "Link i kod nie działają." }
          : { heading: "Zaproszenie wygasło", details: "Zaproszenie jest ważne 24 godziny. Link i kod nie działają." };
      return (
        <Shell>
          <h1 className="m-0 text-section font-strong">{ending.heading}</h1>
          <Alert status="warning" title={`${ending.heading}. Utwórz nowe.`} role="status">
            {ending.details}
          </Alert>
          <div className="flex flex-wrap items-center gap-group">
            <CreateGameButton heldGame={null} />
            <TextLink href="/" placement="standalone">
              Wróć na stronę główną
            </TextLink>
          </div>
        </Shell>
      );
    }
    // L06, A-07: the player who opened the page and the one who did not read different sentences.
    return (
      <Shell>
        <h1 className="m-0 text-section font-strong">Partia anulowana</h1>
        <Alert
          status="warning"
          title={
            mine?.seen
              ? "Przeciwnik nie otworzył partii w ciągu 15 minut. Partię anulowano."
              : "Partię anulowano: nie została otwarta w ciągu 15 minut."
          }
        >
          Nikt nie stracił czasu, a partia nie trafi do historii.
        </Alert>
        <div>
          <Button asChild>
            <Link href="/">Wróć na stronę główną</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (game.status === "waiting") {
    const invitation = game.invitation!;
    const problem =
      fails >= POLL_FAILURES_BEFORE_BANNER ? (
        <Alert status="danger" title="Nie udało się sprawdzić, czy przeciwnik dołączył. Ponawiamy próby.">
          <Button variant="secondary" onClick={() => void poll()}>
            Sprawdź teraz
          </Button>
        </Alert>
      ) : null;
    return (
      <Shell>
        <h1 className="m-0 text-section font-strong">Partia czeka na przeciwnika</h1>
        {ownWaitingNotice && (
          <DismissibleNotice title="Masz już oczekującą partię." closeLabel="Zamknij" />
        )}
        {cancelProblem}
        <TurnStatus>
          {fails > 0 && fails < POLL_FAILURES_BEFORE_BANNER
            ? `Czekamy na przeciwnika… Ponawiamy sprawdzanie (próba ${fails} z ${POLL_FAILURES_BEFORE_BANNER}).`
            : "Czekamy na przeciwnika…"}
        </TurnStatus>
        {problem}
        <div ref={cardRef}>
          {/* LUKA D03: the card has no copy states; the page owns the result line below it. */}
          <InviteCodeCard
            title="Zaproś znajomego"
            link={invitation.url}
            code={invitation.code}
            linkLabel="Link zaproszenia"
            codeLabel="Kod do wpisania na stronie „Masz kod?”"
            validUntil={`Ważne do ${formatValidUntil(invitation.expiresAt)}`}
            copyLabel="Kopiuj"
            copiedLabel="Skopiowano"
            copied={copy === "ok"}
            onCopy={() => void onCopy()}
            shareLabel={canShare ? "Udostępnij" : undefined}
            onShare={canShare ? () => void onShare() : undefined}
            cancelLabel="Anuluj zaproszenie"
            onCancel={() => setAsking(true)}
          />
        </div>
        <p role="status" className="m-0 max-w-(--layout-width-dialog) text-meta text-text-secondary" data-testid="copy-status">
          {copy === "idle" ? "" : COPY_FEEDBACK[copy]}
        </p>
        <ConfirmDialog
          open={asking}
          onOpenChange={(open) => !open && !cancelling && setAsking(false)}
          title="Anulować zaproszenie?"
          description="Link i kod przestaną działać, a partia zostanie anulowana. Tej operacji nie można cofnąć."
          confirmLabel={cancelling ? "Anulowanie…" : "Tak, anuluj zaproszenie"}
          cancelLabel="Wróć"
          confirming={cancelling}
          onConfirm={() => void onConfirmCancel()}
        />
      </Shell>
    );
  }

  if (joinStep) {
    return (
      <Shell>
        <h1 className="m-0 text-section font-strong">Przeciwnik dołączył</h1>
        {cancelProblem}
        <Alert status="success" title={`${nameOf(other)} dołączył do partii`}>
          Za chwilę przejdziesz do partii.
        </Alert>
        <div>
          <Button onClick={() => setJoinStep(false)}>Przejdź do partii</Button>
        </div>
      </Shell>
    );
  }

  if (playing || game.status === "finished") {
    return (
      <Shell>
        <PlayField
          gameId={gameId}
          game={game}
          pollFails={fails}
          reopened={initial.status === "finished"}
          returnNotice={notice?.moveCount === game.moveCount ? notice.text : null}
          onState={applyState}
          onRefresh={() => void poll()}
          onGone={markGone}
        />
      </Shell>
    );
  }

  // `active`, but the other player has not opened the page yet (p04.1): the clocks do not run (Q20).
  return (
    <Shell>
      <h1 className="m-0 text-section font-strong">Czekamy na otwarcie partii</h1>
      {cancelProblem}
      {isGuest && (
        // p04.4: permanent for a guest (BR-22).
        <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
          Stracisz dostęp do partii, a Twój zegar będzie biegł dalej.
        </Alert>
      )}
      <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
        <TurnStatus>
          {`Czekamy, aż ${nameOf(other)} otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)`}
        </TurnStatus>
        <PlayerClock name={<PlayerLabel name={playerNameOf(other)} />} remainingMs={TEN_MINUTES_MS} />
        <PlayerClock name={<PlayerLabel name={playerNameOf(mine)} you />} remainingMs={TEN_MINUTES_MS} />
        <TextLink href="/" placement="standalone">
          Wróć na stronę główną
        </TextLink>
      </div>
    </Shell>
  );
}
