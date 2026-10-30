"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { apiCall } from "@/lib/api-client";

type Mode =
  /** No session: log in, register or play as a guest. */
  | "visitor"
  /** Signed in and free: join. */
  | "member"
  /** Signed in with an own waiting game (Q18): give it up and join. */
  | "swap";

type Props = {
  /** The invitation code in its display form, `ABCD-EFGH`. */
  code: string;
  mode: Mode;
};

type Joining = "user" | "guest";
type Failure = { title: string; details: ReactNode };

/** Answers that mean "the page is out of date": the invitation or the viewer's situation changed. */
const STATE_CHANGED = new Set([
  "INVALID_INVITATION",
  "OWN_INVITATION",
  "OWN_WAITING_GAME",
  "ACTIVE_GAME_EXISTS",
  "GUEST_NOT_ALLOWED",
]);

const GENERIC_FAILURE: Failure = {
  title: "Nie udało się dołączyć do partii",
  details: "Spróbuj ponownie.",
};

/**
 * The buttons of the invitation page. The page itself only opens the link: nothing is used up
 * until a button is pressed (#21 Q12). One request at a time: a second click while one is in
 * flight is ignored, because the second `accept` of a consumed invitation costs a lookup
 * attempt of the pool (Q13) and answers `410`.
 */
export function JoinActions({ code, mode }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [guestWarning, setGuestWarning] = useState(false);
  const [joining, setJoining] = useState<Joining | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // L6: the page was refreshed because its state was out of date. Shown once the refresh is done and
  // only if this component is still there; when the new state replaces it, the page itself says what changed.
  const [outdated, setOutdated] = useState(false);
  // State alone lags a double click by one render; the ref closes that gap.
  const inFlight = useRef(false);

  const nextHref = `/invite/${code}`;
  const next = encodeURIComponent(nextHref);
  const busy = joining !== null || refreshing;

  async function join(as: Joining, body: Record<string, boolean>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setJoining(as);
    setFailure(null);
    setOutdated(false);
    const result = await apiCall<{ gameId: string }>(`/api/invitations/${encodeURIComponent(code)}/accept`, {
      body: { as, ...body },
    });
    if (result.ok) {
      // Stay busy while the page navigates, so a second join is impossible.
      router.replace(`/games/${result.data.gameId}`);
      return;
    }
    inFlight.current = false;
    setJoining(null);
    const errorCode = result.error.code;
    if (STATE_CHANGED.has(errorCode)) {
      // The invitation or the viewer changed under the page: the server decides what it shows now.
      setOutdated(true);
      startRefresh(() => router.refresh());
    } else if (errorCode === "RATE_LIMITED") {
      setFailure({ title: "Zbyt wiele prób — spróbuj za chwilę", details: "Sprawdź kod albo wróć później." });
    } else if (errorCode === "UNAUTHORIZED") {
      setFailure({
        title: "Sesja wygasła",
        details: (
          <>
            <TextLink href={`/login?next=${next}`}>Zaloguj się ponownie</TextLink>, żeby dołączyć do partii.
          </>
        ),
      });
    } else if (errorCode === "network") {
      setFailure({ title: "Brak połączenia", details: "Nie udało się połączyć z serwerem. Spróbuj ponownie." });
    } else {
      setFailure(GENERIC_FAILURE);
    }
  }

  return (
    <>
      {failure && (
        <Alert status="danger" title={failure.title}>
          {failure.details}
        </Alert>
      )}

      {mode === "visitor" && !guestWarning && (
        <>
          <div className="flex flex-wrap gap-group">
            <Button asChild>
              <a href={`/login?next=${next}`}>Zaloguj się</a>
            </Button>
            <Button asChild variant="secondary">
              <a href={`/register?next=${next}`}>Załóż konto</a>
            </Button>
            <Button variant="secondary" onClick={() => setGuestWarning(true)}>
              Graj jako gość
            </Button>
          </div>
          <p className="m-0 text-meta text-text-muted">
            Konto zakładasz w minutę: e-mail, nazwa gracza i hasło co najmniej 8 znaków. Potwierdzenie e-maila możesz zrobić
            później.
          </p>
        </>
      )}

      {mode === "visitor" && guestWarning && (
        <>
          <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
            Stracisz do niej dostęp, a Twój zegar będzie biegł dalej. Gość nie ma nazwy ani historii.
          </Alert>
          <div className="flex flex-wrap gap-group">
            <Button
              loading={joining === "guest"}
              disabled={busy}
              onClick={() => void join("guest", { acknowledgedGuestWarning: true })}
            >
              {joining === "guest" ? "Dołączanie…" : "Rozumiem, graj jako gość"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setGuestWarning(false)}>
              Wróć
            </Button>
          </div>
        </>
      )}

      {mode === "member" && (
        <div>
          <Button loading={joining === "user"} disabled={busy} onClick={() => void join("user", {})}>
            {joining === "user" ? "Dołączanie…" : "Dołącz do partii"}
          </Button>
        </div>
      )}

      {mode === "swap" && (
        <div>
          <Button loading={joining === "user"} disabled={busy} onClick={() => void join("user", { cancelOwnWaitingGame: true })}>
            {joining === "user" ? "Dołączanie…" : "Anuluj moją partię i dołącz"}
          </Button>
        </div>
      )}

      {/* Very quiet on purpose: small muted text, no alert or icon. It is the last element and
          hidden while empty (`empty:hidden`), so it neither adds a gap nor moves anything above it. */}
      <p role="status" className="m-0 text-meta text-text-muted empty:hidden" data-testid="state-changed-note">
        {outdated && !refreshing ? "Coś się zmieniło, odświeżyliśmy stronę" : ""}
      </p>
    </>
  );
}
