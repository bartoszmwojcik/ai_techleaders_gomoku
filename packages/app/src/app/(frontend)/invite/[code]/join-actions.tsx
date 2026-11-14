"use client";

import { nicknameSchema } from "@gomoku/core/games/nickname";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps } from "@/i18n/client";
import { withNodes } from "@/i18n/rich";
import { apiCall } from "@/lib/api-client";
import { fieldMessages, localValueMessage, type ErrorTexts } from "@/lib/api-error-text";

type Mode =
  /** No session: log in, register or play as a guest. */
  | "visitor"
  /** Signed in and free: join. */
  | "member"
  /** Signed in with an own waiting game (Q18): give it up and join. */
  | "swap"
  /** A guest creator with an own waiting game (L35): give it up and join, still as a guest. */
  | "swap-guest";

type Props = TextsProps<"home"> & {
  /** The invitation code in its display form, `ABCD-EFGH`. */
  code: string;
  mode: Mode;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
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

/**
 * The buttons of the invitation page. The page itself only opens the link: nothing is used up
 * until a button is pressed (#21 Q12). One request at a time: a second click while one is in
 * flight is ignored, because the second `accept` of a consumed invitation costs a lookup
 * attempt of the pool (Q13) and answers `410`.
 */
export function JoinActions({ code, mode, errorTexts = {}, ...texts }: Props) {
  const t = textsOf<"home">(plHome, texts);
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

  // The joiner takes seat 2, so "Gracz 2" is the name the empty field stands for.
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const nicknameField = useRef<HTMLInputElement>(null);
  // Bumped on every refusal; the effect moves focus once the field is enabled and shows the error (s07.10).
  const [refusals, setRefusals] = useState(0);
  useEffect(() => {
    if (refusals > 0) nicknameField.current?.focus();
  }, [refusals]);

  function showNicknameError(message: string) {
    setNicknameError(message);
    setRefusals((count) => count + 1);
  }

  /** Joining as a guest: the nickname is checked here with the server's own schema (s07.10), then sent. */
  function joinAsGuest() {
    if (inFlight.current) return;
    // LUKA D08: the text field has no counter and `maxLength` counts UTF-16 units, not code points, so the schema validates.
    const checked = nicknameSchema.safeParse(nickname);
    if (!checked.success) {
      showNicknameError(localValueMessage(errorTexts, "nickname", checked.error));
      return;
    }
    void join("guest", {
      acknowledgedGuestWarning: true,
      ...(checked.data === undefined ? {} : { nickname: checked.data }),
    });
  }

  async function join(as: Joining, body: Record<string, unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setJoining(as);
    setFailure(null);
    setNicknameError(null);
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
    const nicknameRefusal = fieldMessages(errorTexts, ["nickname"], result.error).nickname;
    if (STATE_CHANGED.has(errorCode)) {
      // The invitation or the viewer changed under the page: the server decides what it shows now.
      setOutdated(true);
      startRefresh(() => router.refresh());
    } else if (nicknameRefusal !== undefined) {
      // The server refused the nickname (it validates too): same line under the field as a local refusal.
      showNicknameError(nicknameRefusal);
    } else if (errorCode === "RATE_LIMITED") {
      setFailure({ title: t("shared.tooManyAttempts.title"), details: t("shared.tooManyAttempts.body") });
    } else if (errorCode === "UNAUTHORIZED") {
      setFailure({
        title: t("shared.sessionExpired"),
        details: withNodes(t("joinActions.signedOut", { link: "{link}" }), {
          link: <TextLink href={`/login?next=${next}`}>{t("shared.loginAgain")}</TextLink>,
        }),
      });
    } else if (errorCode === "network") {
      setFailure({ title: t("shared.network.title"), details: t("shared.network.body") });
    } else {
      setFailure({ title: t("joinActions.failedTitle"), details: t("joinActions.failedBody") });
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
              <a href={`/login?next=${next}`}>{t("shared.login")}</a>
            </Button>
            <Button asChild variant="secondary">
              <a href={`/register?next=${next}`}>{t("shared.register")}</a>
            </Button>
            <Button variant="secondary" onClick={() => setGuestWarning(true)}>
              {t("joinActions.playAsGuest")}
            </Button>
          </div>
          <p className="m-0 text-meta text-text-muted">
            {t("joinActions.accountHint")}
          </p>
        </>
      )}

      {mode === "visitor" && guestWarning && (
        <>
          <Alert status="warning" title={t("shared.guestWarningTitle")}>
            {t("joinActions.guestWarningBody")}
          </Alert>
          <Field
            label={t("shared.nickname")}
            requirement={t("shared.optional")}
            id="invite-nickname"
            hint={t("shared.nicknameHint", { seat: 2 })}
            error={nicknameError}
          >
            {(control) => (
              <TextInput
                {...control}
                ref={nicknameField}
                autoComplete="off"
                disabled={busy}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-group">
            <Button loading={joining === "guest"} disabled={busy} onClick={joinAsGuest}>
              {t(joining === "guest" ? "joinActions.joining" : "joinActions.confirmGuest")}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setGuestWarning(false)}>
              {t("shared.back")}
            </Button>
          </div>
        </>
      )}

      {mode === "member" && (
        <div>
          <Button loading={joining === "user"} disabled={busy} onClick={() => void join("user", {})}>
            {t(joining === "user" ? "joinActions.joining" : "joinActions.join")}
          </Button>
        </div>
      )}

      {mode === "swap" && (
        <div>
          <Button loading={joining === "user"} disabled={busy} onClick={() => void join("user", { cancelOwnWaitingGame: true })}>
            {t(joining === "user" ? "joinActions.joining" : "joinActions.swap")}
          </Button>
        </div>
      )}

      {mode === "swap-guest" && (
        <div>
          <Button
            loading={joining === "guest"}
            disabled={busy}
            onClick={() => void join("guest", { acknowledgedGuestWarning: true, cancelOwnWaitingGame: true })}
          >
            {t(joining === "guest" ? "joinActions.joining" : "joinActions.swap")}
          </Button>
        </div>
      )}

      {/* Very quiet on purpose: small muted text, no alert or icon. It is the last element and
          hidden while empty (`empty:hidden`), so it neither adds a gap nor moves anything above it. */}
      <p role="status" className="m-0 text-meta text-text-muted empty:hidden" data-testid="state-changed-note">
        {outdated && !refreshing ? t("joinActions.stateChanged") : ""}
      </p>
    </>
  );
}
