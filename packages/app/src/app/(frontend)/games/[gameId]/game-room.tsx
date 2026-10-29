"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { InviteCodeCard } from "@gomoku/ui/game/invite-code-card";
import { PlayerClock } from "@gomoku/ui/game/player-clock";
import { TextLink } from "@gomoku/ui/game/text-link";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { CreateGameButton } from "@/components/games/create-game-button";
import { DismissibleNotice } from "@/components/games/dismissible-notice";
import { GameGate } from "@/components/games/game-gate";
import { apiCall } from "@/lib/api-client";
import type { GameView } from "@/server/http/game-view";

/** Polling of a waiting game (#21 Q6): short polling every 3 s until a transport from #30 exists. */
export const POLL_INTERVAL_MS = 3000;
/** "Przeciwnik dołączył" stays this long before the page moves on (A-04 of the prototype). */
export const JOIN_STEP_MS = 2500;
/** Failed polls in a row before the banner appears (L02). */
export const POLL_FAILURES_BEFORE_BANNER = 3;

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

/** "wtorek 27 października, 10:00": a fixed zone, so the server and the browser print the same text. */
export function formatValidUntil(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));
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
 * The board and the moves come with the next phase (#22); until then "ready" is the last state.
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
  const polling = useRef(false);
  // State alone lags a double click by one render; the ref closes that gap.
  const cancelInFlight = useRef(false);

  const everyoneSeen = game.players.every((player) => player.seen);
  // `waiting` waits for the opponent; `active` waits for the player who has not opened the page yet (Q20).
  const needsPolling = !gone && (game.status === "waiting" || (game.status === "active" && !everyoneSeen));

  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    const result = await apiCall<GameView>(`/api/games/${gameId}`, { method: "GET" });
    polling.current = false;
    if (result.ok) {
      setFails(0);
      // The creator sees "Przeciwnik dołączył" for a moment before the ready state (p03.5).
      if (status.current === "waiting" && result.data.status === "active") setJoinStep(true);
      status.current = result.data.status;
      setGame(result.data);
    } else if (result.error.code === "NOT_FOUND") {
      setGone(true);
    } else {
      setFails((count) => count + 1);
    }
  }, [gameId]);

  useEffect(() => {
    if (!needsPolling) return;
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [needsPolling, poll]);

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
  const nameOf = (player: typeof other) =>
    player?.kind === "guest" ? "Gość" : (player?.displayName ?? "Usunięty gracz");
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
      setGone(true);
    } else {
      setCancelProblem(
        <Alert status="danger" title="Nie udało się anulować zaproszenia">
          {code === "network" ? "Nie udało się połączyć z serwerem. " : ""}Spróbuj ponownie.
        </Alert>,
      );
    }
  }

  if (game.status === "cancelled") {
    // The creator's own cancel leaves the page, so a one-player game that is cancelled here ran out (24 h, L05).
    if (game.players.length === 1) {
      return (
        <Shell>
          <h1 className="m-0 text-section font-strong">Zaproszenie wygasło</h1>
          <Alert status="warning" title="Zaproszenie wygasło. Utwórz nowe." role="status">
            Zaproszenie jest ważne 24 godziny. Link i kod nie działają.
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

  if (game.status === "active") {
    return (
      <Shell>
        <h1 className="m-0 text-section font-strong">{everyoneSeen ? "Partia gotowa" : "Czekamy na otwarcie partii"}</h1>
        {cancelProblem}
        {isGuest && (
          // p04.4: permanent for a guest (BR-22).
          <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
            Stracisz dostęp do partii, a Twój zegar będzie biegł dalej.
          </Alert>
        )}
        <div className="flex max-w-(--layout-width-board) flex-col gap-stack">
          <TurnStatus>
            {everyoneSeen
              ? "Partia gotowa"
              : `Czekamy, aż ${nameOf(other)} otworzy partię — zegar ruszy, gdy obaj będziecie na stronie (do 15 min)`}
          </TurnStatus>
          <PlayerClock name={nameOf(other)} remainingMs={TEN_MINUTES_MS} />
          <PlayerClock name={`Ty (${nameOf(mine)})`} remainingMs={TEN_MINUTES_MS} />
          <TextLink href="/" placement="standalone">
            Wróć na stronę główną
          </TextLink>
        </div>
      </Shell>
    );
  }

  // `finished`: the result screen belongs to the next phase (#22), nothing can finish a game yet.
  return (
    <Shell>
      <h1 className="m-0 text-section font-strong">Partia zakończona</h1>
      <TextLink href="/" placement="standalone">
        Wróć na stronę główną
      </TextLink>
    </Shell>
  );
}
