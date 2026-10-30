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
    setBusy(null);
  }

  function fail(code: string, retry: Action) {
    if (code === "NOT_FOUND") onGone();
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
    } else if (code === "RATE_LIMITED") {
      const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
      setProblem({ status: "warning", title: `Zbyt wiele propozycji rewanżu. Spróbuj ponownie za ${minutes} min.` });
    } else fail(code, "offer");
  }

  async function accept() {
    const result = await apiCall<{ gameId: string }>(`/api/games/${gameId}/rematch/accept`);
    if (result.ok) {
      setGoing(result.data.gameId);
      patch({ ...game.rematch!, state: "accepted", gameId: result.data.gameId });
      return;
    }
    const { code, data } = result.error;
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
    } else fail(code, "accept");
  }

  async function decline() {
    const result = await apiCall(`/api/games/${gameId}/rematch/decline`);
    if (result.ok) {
      if (mode.kind === "mine") setWithdrawn(true);
      else setRefused(true);
      patch({ ...game.rematch!, state: "declined" });
      return;
    }
    const { code } = result.error;
    if (code === "REMATCH_NOT_OFFERED" || code === "REMATCH_EXPIRED") onRefresh();
    else fail(code, "decline");
  }

  // L21: leaving for the panel declines an open offer, the proposer's own as well. Best effort: the page moves on either way.
  async function onLeave(event: MouseEvent) {
    if (mode.kind !== "mine" && mode.kind !== "theirs") return;
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setLeaving(true);
    await apiCall(`/api/games/${gameId}/rematch/decline`);
    router.push("/");
  }

  const back = (
    <Button asChild variant="secondary">
      <Link href="/" onClick={(event) => void onLeave(event)} data-testid="rematch-leave">
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

  return (
    <section aria-labelledby="rematch-h" className="flex flex-col gap-stack" data-testid="rematch-box">
      <h2 id="rematch-h" className="m-0 text-subsection font-strong">
        Rewanż
      </h2>
      {target && (
        <>
          {claimFailed ? (
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
          ) : (
            <p role="status" className="m-0 text-body text-text-primary" data-testid="rematch-status">
              Rewanż przyjęty. Przechodzimy do nowej partii…
            </p>
          )}
        </>
      )}
      {!target && mode.kind === "none" && (
        <>
          <p className="m-0 text-body text-text-secondary" data-testid="rematch-info">
            Rewanż to nowa partia z odwróconymi kolorami: zagrasz {COLOR_PLAYS[nextColor]}.
          </p>
          {refused && (
            <p role="status" className="m-0 text-body text-text-secondary" data-testid="rematch-status">
              Odrzuciłeś propozycję rewanżu.
            </p>
          )}
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
          <p role="status" className="m-0 text-body text-text-primary" data-testid="rematch-status">
            Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min).
            {countdown(mode.expiresAt)}
          </p>
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
          <p role="status" className="m-0 text-body text-text-primary" data-testid="rematch-status">
            {playerNameOf(other).label} proponuje rewanż. Kolory zostaną zamienione.
            {countdown(mode.expiresAt)}
          </p>
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
          <Alert status="warning" title="Zaproszenie do rewanżu odrzucone" role="status">
            Przeciwnik odrzucił rewanż lub wyszedł do panelu głównego.
          </Alert>
          {alert}
          <div className="flex flex-wrap items-center gap-group">
            {offerButton("Zaproponuj ponownie")}
            {back}
          </div>
        </>
      )}
      {!target && mode.kind === "expired" && (
        <>
          <p role="status" className="m-0 text-body text-text-primary" data-testid="rematch-status">
            Zaproszenie do rewanżu wygasło (po 5 minutach).
          </p>
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
