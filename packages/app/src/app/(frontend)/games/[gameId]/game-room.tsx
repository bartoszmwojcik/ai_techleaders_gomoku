"use client";

import { AGENT_CLIENTS, agentClientSetup, DEFAULT_AGENT_CLIENT, isAgentClient, type AgentClient } from "@gomoku/core/games/agent-connect";
import { isReturnNoticeFresh } from "@gomoku/core/games/return-notice";
import { AgentConnectCard } from "@gomoku/ui/game/agent-connect-card";
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

import { ChatPanel } from "@/components/chat/chat-panel";
import { CreateGameButton } from "@/components/games/create-game-button";
import { DismissibleNotice } from "@/components/games/dismissible-notice";
import { GameGate } from "@/components/games/game-gate";
import { PlayerLabel } from "@/components/games/player-label";
import { PlayField } from "@/components/games/play-field";
import { serverNowMs } from "@/components/games/use-server-now";
import { usePageVisibility } from "@/components/games/use-page-visibility";
import { apiCall } from "@/lib/api-client";
import { AGENT_CLIENT_COPY } from "@/lib/games/agent-clients";
import { formatValidUntil } from "@/lib/format-date-time";
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

/** A result screen with no offer for this long reads the state less often (an unattended tab left open for days). */
export const REMATCH_IDLE_AFTER_MS = 3 * 60 * 1000;
/** The slow pace of an idle result screen; coming back to the tab or any rematch activity returns to 3 s. */
export const REMATCH_IDLE_POLL_INTERVAL_MS = 12_000;
/**
 * A guest's token for a finished game works for an hour (BR-22); the page stops reading it 5 minutes
 * earlier instead of running into the sudden "Brak dostępu" (the rematch margin of the backend is the same).
 */
export const GUEST_RESULT_WINDOW_MS = 55 * 60 * 1000;

const TEN_MINUTES_MS = 10 * 60 * 1000;

type Props = {
  gameId: string;
  initial: GameView;
  /** The player pressed "Utwórz zaproszenie" while already waiting in this game (L01). */
  ownWaitingNotice: boolean;
};

type Copy = "idle" | "ok" | "fail" | "share-fail" | "command-ok" | "config-ok" | "code-ok" | "text-fail";

const COPY_FEEDBACK: Record<Exclude<Copy, "idle">, string> = {
  ok: "Skopiowano link do schowka.",
  fail: "Nie można skopiować automatycznie. Link jest zaznaczony — skopiuj go ręcznie (Ctrl+C).",
  "share-fail": "Nie udało się otworzyć udostępniania. Skopiuj link ręcznie.",
  "command-ok": "Skopiowano polecenie do schowka.",
  "config-ok": "Skopiowano konfigurację do schowka.",
  "code-ok": "Skopiowano kod do schowka.",
  "text-fail": "Nie można skopiować automatycznie. Tekst jest zaznaczony — skopiuj go ręcznie (Ctrl+C).",
};

// `navigator.share` exists only in some browsers; the server cannot know, so the first render says no.
const subscribeNothing = () => () => {};
const canShareNow = () => typeof navigator.share === "function";
const cannotShareOnServer = () => false;

const rematchAccepted = (game: GameView) => game.status === "finished" && game.rematch?.state === "accepted";

/** A guest's result is out of reach 55 minutes after the end (server time, so the device clock does not matter). */
function pastGuestWindow(game: GameView): boolean {
  if (game.you.kind !== "guest" || !game.finishedAt) return false;
  return serverNowMs(game.clock) >= Date.parse(game.finishedAt) + GUEST_RESULT_WINDOW_MS;
}

/** `compact`: the board screen on a phone has tighter margins, so the board and its button fit the first screen (issue 181). */
function Shell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <main
      data-theme-overlay={compact ? "" : undefined}
      className={`mx-auto flex w-full flex-1 max-w-(--layout-width-dialog) flex-col gap-stack ${
        compact ? "px-stack py-group sm:px-panel sm:py-section" : "px-panel py-section"
      }`}
    >
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
  // The agent client is screen state only: not remembered anywhere (E07-S05).
  const [agentClient, setAgentClient] = useState<AgentClient>(DEFAULT_AGENT_CLIENT);
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelProblem, setCancelProblem] = useState<ReactNode>(null);
  const canShare = useSyncExternalStore(subscribeNothing, canShareNow, cannotShareOnServer);
  const cardRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<HTMLDivElement>(null);
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
  // Counts every state the room takes in, so a read that began before another state arrived can tell (L4).
  const version = useRef(0);
  // The read in flight, so accepting a rematch can call it off (L3), and the one that was called off.
  const readController = useRef<AbortController | null>(null);
  const calledOff = useRef<AbortController | null>(null);
  // The rematch is being accepted: nothing is read meanwhile (L3).
  const accepting = useRef(false);
  // When the result screen last had something going on; the idle pace starts REMATCH_IDLE_AFTER_MS after it.
  const quietSince = useRef<number | null>(null);
  // Restarts the polling timer (after coming back to the tab), set by the polling effect.
  const reschedule = useRef<(() => void) | null>(null);

  const everyoneSeen = game.players.every((player) => player.seen);
  // `waiting` waits for the opponent; `active` waits for the player who has not opened the page yet (Q20).
  const waitingForOpponent = game.status === "waiting" || (game.status === "active" && !everyoneSeen);
  const playing = game.status === "active" && everyoneSeen;

  // The move just played answers with the new state (`after` = moves known before it).
  const applyState = useCallback((next: GameView, after: number) => {
    const merged = mergeState(latest.current, next, after);
    version.current += 1;
    // Any change of the rematch (an offer, an answer) is activity: the 3 s pace is back.
    if (merged.rematch?.state !== latest.current.rematch?.state) quietSince.current = Date.now();
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
    const startedVersion = version.current;
    const after = latest.current.moves.length;
    // One controller for the timeout and for calling the read off.
    const controller = new AbortController();
    AbortSignal.timeout(POLL_TIMEOUT_MS).addEventListener("abort", () => controller.abort(), { once: true });
    readController.current = controller;
    const result = await apiCall<GameView>(`/api/games/${gameId}?after=${after}`, {
      method: "GET",
      signal: controller.signal,
    });
    readController.current = null;
    if (calledOff.current === controller) return;
    // A state that came meanwhile (the player's own answer) is newer than this read's; one more read follows (L4).
    if (version.current !== startedVersion && latest.current.status === "finished") {
      readAgain.current = true;
      return;
    }
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
    // Once the rematch is accepted the old game is not read again: a guest's cookie already points at the new one (L2).
    if (polling.current || accepting.current || rematchAccepted(latest.current)) return;
    polling.current = true;
    do {
      readAgain.current = false;
      await readOnce();
      // An accepted rematch has moved the guest's cookie on to the new game: no more reads of this one (L2).
    } while (readAgain.current && !rematchAccepted(latest.current) && !accepting.current);
    polling.current = false;
  }, [readOnce]);

  // A hidden tab does not poll (#22 UI); coming back reads the state at once (#24 Q5).
  const hidden = usePageVisibility({
    onReturn: ({ longAbsence }) => {
      quietSince.current = Date.now();
      if (gone || rematchAccepted(latest.current) || accepting.current) return;
      if (status.current !== "waiting" && status.current !== "active" && status.current !== "finished") return;
      if (pastGuestWindow(latest.current)) return;
      reschedule.current?.();
      returnedAt.current = longAbsence ? Date.now() : null;
      // A read in flight may predate the return: the one after it is the one that counts.
      if (polling.current) readAgain.current = true;
      else void poll();
    },
  });
  // A finished game is read until the rematch is accepted: the opponent may offer one at any time.
  const watchingRematch = game.status === "finished" && game.rematch?.state !== "accepted";
  const needsPolling = !gone && !hidden && (waitingForOpponent || playing || watchingRematch);

  // The pace of the next read, or `null` when none is due any more. A result screen slows down when
  // nothing happens on it (an offer, an answer, the player's return), and a guest's stops with the token.
  const nextDelay = useCallback((): number | null => {
    if (playing) return PLAY_POLL_INTERVAL_MS;
    if (latest.current.status !== "finished") return POLL_INTERVAL_MS;
    if (pastGuestWindow(latest.current)) return null;
    const now = Date.now();
    if (latest.current.rematch?.state === "pending") quietSince.current = now;
    quietSince.current ??= now;
    return now - quietSince.current >= REMATCH_IDLE_AFTER_MS ? REMATCH_IDLE_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
  }, [playing]);

  useEffect(() => {
    if (!needsPolling) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const delay = nextDelay();
      if (delay === null) return;
      timer = setTimeout(() => {
        void poll();
        schedule();
      }, delay);
    };
    reschedule.current = () => {
      clearTimeout(timer);
      schedule();
    };
    schedule();
    return () => {
      clearTimeout(timer);
      reschedule.current = null;
    };
  }, [needsPolling, nextDelay, poll]);

  // Coming back to the window is activity too: the 3 s pace and a read at once (the tab may not have been hidden).
  useEffect(() => {
    if (!needsPolling) return;
    const onFocus = () => {
      quietSince.current = Date.now();
      if (accepting.current || pastGuestWindow(latest.current)) return;
      void poll();
      reschedule.current?.();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [needsPolling, poll]);

  // The rematch is being accepted: the read in flight is called off and none starts until the answer is in (L3).
  const onAccepting = useCallback((active: boolean) => {
    accepting.current = active;
    if (!active) return;
    calledOff.current = readController.current;
    readController.current?.abort();
  }, []);

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

  function onAgentClientChange(value: string) {
    if (!isAgentClient(value)) return;
    setAgentClient(value);
    setCopy("idle");
  }

  async function onCopyAgentText(which: "snippet" | "code", text: string, done: Copy) {
    try {
      await navigator.clipboard.writeText(text);
      setCopy(done);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(agentRef.current!.querySelector(`[data-copy="${which}"]`)!);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      setCopy("text-fail");
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
            {isGuest ? (
              // A guest creates from p08 (nickname and warning), not with one click (p03.13).
              <Button asChild>
                <Link href="/play">Utwórz nowe zaproszenie</Link>
              </Button>
            ) : (
              <CreateGameButton heldGame={null} />
            )}
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
    const clientCopy = AGENT_CLIENT_COPY[agentClient];
    const setup = invitation.mcpUrl ? agentClientSetup(agentClient, invitation.mcpUrl) : null;
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
        {setup && (
          <div ref={agentRef}>
            <AgentConnectCard
              summary="Jak podłączyć agenta"
              clientLabel="Klient"
              clients={AGENT_CLIENTS.map((value) => ({ value, label: AGENT_CLIENT_COPY[value].label }))}
              client={agentClient}
              onClientChange={onAgentClientChange}
              snippetIntro={clientCopy.intro}
              snippet={setup.text}
              copySnippetLabel={clientCopy.copyLabel}
              checkText={clientCopy.check}
              codeIntro={`Powiedz agentowi: „Dołącz do partii gomoku narzędziem join z kodem ${invitation.code}”.`}
              code={invitation.code}
              copyCodeLabel="Kopiuj kod"
              serverLabel="Adres serwera"
              serverUrl={invitation.mcpUrl}
              copiedLabel="Skopiowano"
              copied={copy === "command-ok" || copy === "config-ok" ? "snippet" : copy === "code-ok" ? "code" : null}
              onCopySnippet={() => void onCopyAgentText("snippet", setup.text, setup.kind === "config" ? "config-ok" : "command-ok")}
              onCopyCode={() => void onCopyAgentText("code", invitation.code, "code-ok")}
              note={`Inny klient MCP? Podaj mu adres serwera (Streamable HTTP, bez uwierzytelniania). Agent dołączy jako „Agent”. Nie podawaj mu hasła ani tokenów — nie są potrzebne. Agent może czytać czat partii i na nim pisać; wiadomości, które wpiszesz, trafią do modelu jako tekst. Nie wpisuj tajnych danych. Czat możesz wyłączyć w partii.${clientCopy.note ? ` ${clientCopy.note}` : ""}`}
            />
          </div>
        )}
        <p role="status" className="m-0 max-w-(--layout-width-dialog) text-meta text-text-secondary" data-testid="copy-status">
          {copy === "idle" ? "" : COPY_FEEDBACK[copy]}
        </p>
        {isGuest && (
          // p03.12 (L28): permanent, because losing the browser means losing the game. LUKA D10: no pattern
          // for a warning under the code card; a plain Alert.
          <Alert status="warning" title="Nie zmieniaj przeglądarki, bo stracisz dostęp do partii." />
        )}
        <ChatPanel gameId={gameId} game={game} onGone={markGone} />
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
      <Shell compact>
        <PlayField
          gameId={gameId}
          game={game}
          pollFails={fails}
          reopened={initial.status === "finished"}
          returnNotice={notice?.moveCount === game.moveCount ? notice.text : null}
          onState={applyState}
          onRefresh={() => void poll()}
          onAccepting={onAccepting}
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
