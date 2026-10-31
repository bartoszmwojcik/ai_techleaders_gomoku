"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { formatClock } from "@gomoku/ui/game/format-clock";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { apiCall } from "@/lib/api-client";
import { rematchModeOf } from "@/lib/games/rematch";
import { colorOfSeat, COLOR_PLAYS, playerNameOf } from "@/lib/games/play";
import type { GameView } from "@/server/http/game-view";

import { useServerNow } from "./use-server-now";

type Props = {
  gameId: string;
  game: GameView;
  /** The page was opened on a game that was already over (reload, another device). */
  reopened: boolean;
  /** Hands a state the page built from an answer (the room merges it like a read). */
  onState: (next: GameView, after: number) => void;
  /** Reads the state now. */
  onRefresh: () => void;
  /** The acceptance is on its way (`true`) or answered (`false`): the room reads nothing meanwhile (L3). */
  onAccepting: (active: boolean) => void;
  /** The game is gone for this visitor (`404`). */
  onGone: () => void;
};

type Rematch = NonNullable<GameView["rematch"]>;
type Action = "offer" | "accept" | "decline";
type Problem = {
  status: "danger" | "warning" | "info";
  title: string;
  /** Sending the same thing again can help (network, server). */
  retry?: Action;
  link?: string;
};

const NETWORK_ERROR = "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

/** How often a result screen asks whether the opponent offered a rematch (nothing else changes there). */
export const REMATCH_POLL_INTERVAL_MS = 3000;

/** Leaving for the main page waits this long for the decline; then it goes on without the answer (L5). */
export const LEAVE_DECLINE_TIMEOUT_MS = 3000;

const FOCUS_TARGET = "outline-none";
export const AGENT_REMATCH_HINT = "Aby zagrać z agentem jeszcze raz, utwórz nową partię i przekaż mu nowy kod.";

/**
 * The rematch block under the result (p06.10-p06.15): the offer, the wait with its countdown, the
 * opponent's offer, a refusal, an expiry and the move to the new game. The room polls and owns
 * the state; this block only sends the three calls and reads `game.rematch`.
 *
 * A guest who proposed gets the token of the new game from `GET /api/games/{id}` of THIS game
 * once the offer is accepted (`Set-Cookie`). A poll that sees `accepted` is that read; a page opened
 * on an already accepted rematch makes it once, here, before it moves on. Without it the proposer
 * would find a 404 in the new game.
 */
export function RematchPanel({ gameId, game, reopened, onState, onRefresh, onAccepting, onGone }: Props) {
  const router = useRouter();
  const guest = game.you.kind === "guest";
  const mySeat = game.you.seat;
  const other = game.players.find((player) => player.seat !== mySeat);
  const nextColor = colorOfSeat(game.blackSeat, mySeat) === "black" ? "white" : "black";

  const [withdrawn, setWithdrawn] = useState(false);
  const [refused, setRefused] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [leaving, setLeaving] = useState(false);
  // The game the acceptor goes to (the answer of `accept`); the proposer learns it from the state.
  const [going, setGoing] = useState<string | null>(null);
  const [claimFailed, setClaimFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // State alone lags a double click by one render; the ref closes that gap.
  const inFlight = useRef(false);
  // Where the focus goes after an answer, because the button that was pressed is gone (L6).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusAfterAnswer = useRef(false);
  // A guest on a page opened on an accepted rematch still has to fetch the token (see above).
  const claimFirst = useRef(reopened && guest && game.rematch?.state === "accepted");

  const now = useServerNow(game.clock, game.rematch?.state === "pending");
  const mode = rematchModeOf(game.rematch, mySeat, now ?? 0, withdrawn);
  const target = going ?? (mode.kind === "accepted" ? mode.gameId : null);
  // The move-on effect must run once per target and attempt, whatever the identity of these two is.
  const handlers = useRef({ router, onGone });
  useEffect(() => {
    handlers.current = { router, onGone };
  });

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    void (async () => {
      if (claimFirst.current) {
        const claim = await apiCall(`/api/games/${gameId}`, { method: "GET" });
        if (cancelled) return;
        if (!claim.ok) {
          if (claim.error.code === "NOT_FOUND") handlers.current.onGone();
          else setClaimFailed(true);
          return;
        }
        claimFirst.current = false;
      }
      handlers.current.router.push(`/games/${target}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [target, attempt, gameId]);

  function patch(next: Rematch) {
    // A full copy of the state: `after = 0` replaces the moves with the same moves.
    onState({ ...game, rematch: next }, 0);
  }

  async function perform(action: Action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    setProblem(null);
    if (action === "offer") await offer();
    else if (action === "accept") {
      // A read begun before the acceptance must not land after it and put the old token back (L3).
      onAccepting(true);
      await accept();
      onAccepting(false);
    } else await decline();
    inFlight.current = false;
    focusAfterAnswer.current = true;
    setBusy(null);
  }

  // After the player's own action the pressed button is gone or disabled and the focus would fall to
  // the page: it goes to the status (the new state in words), or to the heading when there is none (L6).
  useEffect(() => {
    if (!focusAfterAnswer.current) return;
    focusAfterAnswer.current = false;
    (statusRef.current?.textContent ? statusRef.current : headingRef.current)?.focus();
  });

  function fail(code: string, retry: Action, retryAfterSeconds?: number) {
    if (code === "NOT_FOUND") onGone();
    else if (code === "RATE_LIMITED") {
      const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
      setProblem({ status: "warning", title: `Zbyt wiele propozycji rewanżu. Spróbuj ponownie za ${minutes} min.` });
    }
    else setProblem({ status: "danger", title: code === "network" ? NETWORK_ERROR : "Coś poszło nie tak. Spróbuj ponownie.", retry });
  }

  async function offer() {
    const result = await apiCall<Omit<Rematch, "expiresAt"> & { expiresAt: string }>(`/api/games/${gameId}/rematch`);
    if (result.ok) {
      setWithdrawn(false);
      setRefused(false);
      patch(result.data);
      return;
    }
    const { code, retryAfterSeconds } = result.error;
    if (code === "REMATCH_ALREADY_OFFERED" || code === "GAME_NOT_FINISHED") {
      // The opponent was first: their offer is read and shown for acceptance.
      setProblem({ status: "info", title: "Przeciwnik zdążył zaproponować rewanż. Odświeżamy stan." });
      onRefresh();
    } else fail(code, "offer", retryAfterSeconds);
  }

  async function accept() {
    const result = await apiCall<{ gameId: string }>(`/api/games/${gameId}/rematch/accept`);
    if (result.ok) {
      setGoing(result.data.gameId);
      patch({ ...game.rematch!, state: "accepted", gameId: result.data.gameId });
      return;
    }
    const { code, data, retryAfterSeconds } = result.error;
    if (code === "ACTIVE_GAME_EXISTS") {
      // The link is for the caller's own game only; for the opponent's the server says nothing (Q4).
      const own = typeof data?.gameId === "string" ? data.gameId : undefined;
      setProblem(
        own
          ? { status: "warning", title: "Masz już partię w toku. Dokończ ją, a potem przyjmij rewanż.", link: `/games/${own}` }
          : { status: "warning", title: "Przeciwnik ma już inną partię w toku. Propozycja trwa do wygaśnięcia lub odrzucenia." },
      );
    } else if (code === "REMATCH_UNAVAILABLE") {
      setUnavailable(true);
      setProblem({ status: "warning", title: "Rewanż jest niemożliwy: przeciwnik nie jest już dostępny." });
    } else if (code === "REMATCH_EXPIRED") {
      setProblem({ status: "info", title: "Propozycja rewanżu wygasła." });
      onRefresh();
    } else if (code === "REMATCH_NOT_OFFERED") {
      setProblem({ status: "info", title: "Przeciwnik wycofał propozycję rewanżu." });
      onRefresh();
    } else fail(code, "accept", retryAfterSeconds);
  }

  async function decline() {
    const result = await apiCall(`/api/games/${gameId}/rematch/decline`);
    if (result.ok) {
      if (mode.kind === "mine") setWithdrawn(true);
      else setRefused(true);
      patch({ ...game.rematch!, state: "declined" });
      return;
    }
    const { code, retryAfterSeconds } = result.error;
    if (code === "REMATCH_NOT_OFFERED" || code === "REMATCH_EXPIRED") onRefresh();
    else fail(code, "decline", retryAfterSeconds);
  }

  // L21: leaving for the panel declines an open offer, the proposer's own as well. Best effort: the page moves on either way.
  async function onLeave(event: MouseEvent<HTMLAnchorElement>) {
    // Open in a new tab or window, download: the browser's own link behaviour, nothing is declined (L5).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (mode.kind !== "mine" && mode.kind !== "theirs") return;
    event.preventDefault();
    // The link looks disabled while another call is on its way (`aria-disabled`); a keyboard press is not swallowed silently.
    if (inFlight.current) return;
    inFlight.current = true;
    setLeaving(true);
    await apiCall(`/api/games/${gameId}/rematch/decline`, { signal: AbortSignal.timeout(LEAVE_DECLINE_TIMEOUT_MS) });
    router.push("/");
  }

  const leaveBlocked = (mode.kind === "mine" || mode.kind === "theirs") && (busy !== null || leaving);
  const back = (
    <Button asChild variant="secondary">
      <Link
        href="/"
        onClick={(event) => void onLeave(event)}
        aria-disabled={leaveBlocked || undefined}
        className="aria-disabled:pointer-events-none aria-disabled:text-text-muted"
        data-testid="rematch-leave"
      >
        Wróć do panelu głównego
      </Link>
    </Button>
  );
  const guestNote = guest && (
    <p className="m-0 text-meta text-text-secondary" data-testid="guest-rematch-note">
      Jako gość dostaniesz nowy dostęp do nowej partii w tej przeglądarce.
    </p>
  );
  const retry = problem?.retry;
  const alert: ReactNode = problem && (
    <Alert status={problem.status} title={problem.title} role={problem.status === "danger" ? "alert" : "status"}>
      {retry && (
        <Button variant="secondary" onClick={() => void perform(retry)} data-testid="rematch-retry">
          Spróbuj ponownie
        </Button>
      )}
      {problem.link && (
        <Button asChild variant="secondary">
          <Link href={problem.link} data-testid="rematch-own-game">
            Przejdź do swojej partii
          </Link>
        </Button>
      )}
    </Alert>
  );
  const offerButton = (label: string) => (
    <Button loading={busy === "offer"} disabled={leaving} onClick={() => void perform("offer")} data-testid="rematch-offer">
      {busy === "offer" ? "Wysyłanie…" : label}
    </Button>
  );
  const countdown = (expiresAt: number) =>
    now !== null && (
      <span aria-hidden="true" data-testid="rematch-countdown">
        {" "}
        Pozostało {formatClock(expiresAt - now)}.
      </span>
    );

  // One status element for every state, present before its words change, so a screen reader announces the change (L6).
  let statusText: ReactNode = null;
  let statusTone = "text-text-primary";
  if (target) statusText = claimFailed ? null : "Rewanż przyjęty. Przechodzimy do nowej partii…";
  else if (mode.kind === "none" && refused) {
    statusText = "Odrzuciłeś propozycję rewanżu.";
    statusTone = "text-text-secondary";
  } else if (mode.kind === "mine") {
    statusText = (
      <>
        Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min).
        {countdown(mode.expiresAt)}
      </>
    );
  } else if (mode.kind === "theirs") {
    statusText = (
      <>
        {playerNameOf(other).label} proponuje rewanż. Kolory zostaną zamienione.
        {countdown(mode.expiresAt)}
      </>
    );
  } else if (mode.kind === "declined") {
    statusText = "Zaproszenie do rewanżu odrzucone. Przeciwnik odrzucił rewanż lub wyszedł do panelu głównego.";
    statusTone = "sr-only";
  } else if (mode.kind === "expired") statusText = "Zaproszenie do rewanżu wygasło (po 5 minutach).";

  // No offer is possible against an agent (BR-31: a rematch has no code to hand to it) or against
  // an account that was deleted (#37), and a closed offer is not announced.
  const unavailableNote =
    other?.kind === "agent"
      ? { testId: "rematch-agent-hint", text: AGENT_REMATCH_HINT }
      : other?.kind === "account" && other.displayName === null
        ? { testId: "rematch-unavailable", text: "Ten gracz nie ma już konta, więc nie możesz zaproponować rewanżu." }
        : null;
  if (unavailableNote && !target) {
    return (
      <section aria-labelledby="rematch-h" className="flex flex-col gap-stack" data-testid="rematch-box">
        <h2 ref={headingRef} id="rematch-h" tabIndex={-1} className={`m-0 text-subsection font-strong ${FOCUS_TARGET}`}>
          Rewanż
        </h2>
        <Alert status="info" title="Rewanż niedostępny" role="status">
          <span data-testid={unavailableNote.testId}>{unavailableNote.text}</span>
        </Alert>
        <div className="flex flex-wrap items-center gap-group">{back}</div>
      </section>
    );
  }

  return (
    <section aria-labelledby="rematch-h" className="flex flex-col gap-stack" data-testid="rematch-box">
      <h2 ref={headingRef} id="rematch-h" tabIndex={-1} className={`m-0 text-subsection font-strong ${FOCUS_TARGET}`}>
        Rewanż
      </h2>
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className={`m-0 text-body empty:sr-only ${FOCUS_TARGET} ${statusTone}`}
        data-testid="rematch-status"
      >
        {statusText}
      </p>
      {target && claimFailed && (
        <Alert status="danger" title="Nie udało się przejść do nowej partii.">
          <Button
            variant="secondary"
            onClick={() => {
              setClaimFailed(false);
              setAttempt((count) => count + 1);
            }}
            data-testid="rematch-claim-retry"
          >
            Spróbuj ponownie
          </Button>
        </Alert>
      )}
      {!target && mode.kind === "none" && (
        <>
          <p className="m-0 text-body text-text-secondary" data-testid="rematch-info">
            Rewanż to nowa partia z odwróconymi kolorami: zagrasz {COLOR_PLAYS[nextColor]}.
          </p>
          {guestNote}
          {alert}
          <div className="flex flex-wrap items-center gap-group">
            {offerButton("Rewanż")}
            {back}
          </div>
        </>
      )}
      {!target && mode.kind === "mine" && (
        <>
          {guestNote}
          {alert}
          <div className="flex flex-wrap items-center gap-group">
            <Button variant="secondary" loading={busy === "decline"} onClick={() => void perform("decline")} data-testid="rematch-withdraw">
              {busy === "decline" ? "Wycofywanie…" : "Wycofaj propozycję"}
            </Button>
            {back}
          </div>
        </>
      )}
      {!target && mode.kind === "theirs" && (
        <>
          {guestNote}
          {alert}
          <div className="flex flex-wrap items-center gap-group">
            {!unavailable && (
              <Button loading={busy === "accept"} disabled={busy === "decline" || leaving} onClick={() => void perform("accept")} data-testid="rematch-accept">
                {busy === "accept" ? "Przyjmowanie…" : "Przyjmij"}
              </Button>
            )}
            <Button variant="secondary" loading={busy === "decline"} disabled={busy === "accept" || leaving} onClick={() => void perform("decline")} data-testid="rematch-decline">
              Odrzuć
            </Button>
            {back}
          </div>
        </>
      )}
      {!target && mode.kind === "declined" && (
        <>
          {/* The words are in the status above (announced when they appear); the box repeats them for the eye only. */}
          <div aria-hidden="true">
            <Alert status="warning" title="Zaproszenie do rewanżu odrzucone" role="none">
              Przeciwnik odrzucił rewanż lub wyszedł do panelu głównego.
            </Alert>
          </div>
          {alert}
          <div className="flex flex-wrap items-center gap-group">
            {offerButton("Zaproponuj ponownie")}
            {back}
          </div>
        </>
      )}
      {!target && mode.kind === "expired" && (
        <>
          {alert}
          <div className="flex flex-wrap items-center gap-group">
            {offerButton("Zaproponuj ponownie")}
            {back}
          </div>
        </>
      )}
    </section>
  );
}
