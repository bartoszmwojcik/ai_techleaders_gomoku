"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Checkbox } from "@gomoku/ui/game/checkbox";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { Panel } from "@gomoku/ui/game/panel";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { apiCall } from "@/lib/api-client";

type DeleteAccountFormProps = {
  displayName: string;
  /** The game the account holds (waiting or in progress), read on the server. */
  currentGame: { gameId: string; status: "waiting" | "active" } | null;
};

type Phase = "idle" | "asking" | "deleting";
type General = { title: string; text: string };

const PASSWORD_ID = "delete-account-password";
const SERVER_ERROR = "Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie.";
const WRONG_PASSWORD = "Nieprawidłowe hasło.";

function rateLimited(retryAfterSeconds: number | undefined): General {
  const minutes = retryAfterSeconds === undefined ? undefined : Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return {
    title: "Zbyt wiele prób",
    text: minutes === undefined ? "Spróbuj ponownie za jakiś czas." : `Spróbuj ponownie za ${minutes} min.`,
  };
}

// Radix returns focus to the trigger when the dialog closes; the field or the message must win.
const focusLater = (focus: () => void) => setTimeout(focus, 80);

/**
 * "Usuń konto" on /account (E01-S06, #37; prototype `konta-i-role`, states s05.10–s05.20): the
 * password sits in the panel, the dialog only asks. The deletion is final, so a success reloads
 * the whole page on `/?notice=account-deleted` (the layout reads the session).
 */
export function DeleteAccountForm({ displayName, currentGame }: DeleteAccountFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  // Remounting a password field hides the password again.
  const [passwordKey, setPasswordKey] = useState(0);
  const [checked, setChecked] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [general, setGeneral] = useState<General | null>(null);
  const [dialogError, setDialogError] = useState(false);
  // The game in progress, from the server or from a `409` (it started meanwhile).
  const [activeGameId, setActiveGameId] = useState(currentGame?.status === "active" ? currentGame.gameId : null);
  // A ref, not state: it must block a second send in the same tick, before the button is busy.
  const sending = useRef(false);
  const blockRef = useRef<HTMLDivElement>(null);

  const reason = activeGameId
    ? "Usunięcie jest możliwe dopiero po zakończeniu partii."
    : !checked
      ? "Zaznacz potwierdzenie, aby usunąć konto."
      : null;

  const focusPassword = () => focusLater(() => document.getElementById(PASSWORD_ID)?.focus());

  function ask() {
    setGeneral(null);
    setDialogError(false);
    if (!password) {
      setFieldError("Wpisz hasło.");
      focusPassword();
      return;
    }
    setFieldError(undefined);
    setPhase("asking");
  }

  async function confirm() {
    if (sending.current) return;
    sending.current = true;
    setPhase("deleting");
    setDialogError(false);
    const result = await apiCall<null>("/api/account/delete", { body: { password, confirm: true } });
    sending.current = false;

    if (result.ok) {
      window.location.assign("/?notice=account-deleted");
      return;
    }
    const { code, data, fieldErrors, retryAfterSeconds } = result.error;
    if (code === "UNAUTHORIZED") {
      // The session is gone (or the account already): sign in again and come back here.
      router.replace(`/login?next=${encodeURIComponent("/account")}`);
      return;
    }
    if (code === "INVALID_PASSWORD") {
      setPhase("idle");
      setPassword("");
      setPasswordKey((key) => key + 1);
      setFieldError(fieldErrors?.password?.[0] ?? WRONG_PASSWORD);
      focusPassword();
      return;
    }
    if (code === "RATE_LIMITED") {
      setPhase("idle");
      setGeneral(rateLimited(retryAfterSeconds));
      return;
    }
    if (code === "ACTIVE_GAME" && typeof data?.gameId === "string") {
      setPhase("idle");
      setFieldError(undefined);
      setActiveGameId(data.gameId);
      focusLater(() => blockRef.current?.focus());
      return;
    }
    // A server or network failure: nothing was changed, the dialog stays open for a retry.
    setPhase("asking");
    setDialogError(true);
  }

  return (
    <Panel title="Usuń konto" className="border-status-danger" data-testid="delete-account-panel">
      <Alert status="warning" role="none" title="Tego nie da się cofnąć">
        <p className="m-0">
          Twoje konto, e-mail i hasło zostaną usunięte od razu i na zawsze. Twoje zakończone partie zostaną u
          przeciwników jako „Usunięty gracz”.
        </p>
        {currentGame?.status === "waiting" && (
          <p className="m-0 mt-group" data-testid="delete-account-waiting">
            Twoja oczekująca partia i jej zaproszenie zostaną usunięte.
          </p>
        )}
      </Alert>
      {activeGameId && (
        <div ref={blockRef} tabIndex={-1} className="focus-visible:focus-ring" data-testid="delete-account-active-game">
          <Alert status="warning" title="Najpierw dokończ albo poddaj partię.">
            Masz partię w toku. Na stronie partii wybierz „Poddaj partię”, a potem odśwież tę stronę.{" "}
            <TextLink href={`/games/${activeGameId}`}>Przejdź do partii</TextLink>
          </Alert>
        </div>
      )}
      {general && (
        <div data-testid="delete-account-error">
          <ErrorMessage title={general.title}>{general.text}</ErrorMessage>
        </div>
      )}
      <PasswordField
        key={passwordKey}
        id={PASSWORD_ID}
        name="password"
        label="Hasło"
        showLabel="Pokaż hasło"
        hideLabel="Ukryj hasło"
        hint="Podaj hasło, aby potwierdzić, że to Ty."
        error={fieldError}
        autoComplete="current-password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          setFieldError(undefined);
        }}
        className="max-w-sm"
      />
      <Checkbox
        label="Rozumiem, że tego nie da się cofnąć"
        checked={checked}
        onCheckedChange={(value) => setChecked(value === true)}
        data-testid="delete-account-confirm"
      />
      <div className="flex flex-col items-start gap-group">
        <ConfirmDialog
          open={phase !== "idle"}
          onOpenChange={(open) => {
            // The button is the trigger, so focus returns to it on close. Esc and the way out are
            // blocked while the server works.
            if (open) ask();
            else if (phase !== "deleting") setPhase("idle");
          }}
          trigger={
            <Button
              variant="danger"
              disabled={reason !== null}
              aria-describedby={reason ? "delete-account-reason" : undefined}
              data-testid="delete-account-submit"
            >
              Usuń konto na zawsze
            </Button>
          }
          title={`Usunąć konto ${displayName}?`}
          description={
            <>
              Twoje zakończone partie zostaną u przeciwników jako „Usunięty gracz”. Tego nie da się cofnąć.
              {currentGame?.status === "waiting" ? " Twoja oczekująca partia i jej zaproszenie zostaną usunięte." : ""}
            </>
          }
          message={dialogError ? SERVER_ERROR : undefined}
          confirmLabel="Usuń konto na zawsze"
          cancelLabel="Zostaw konto"
          confirming={phase === "deleting"}
          onConfirm={() => void confirm()}
        />
        {reason && (
          <p id="delete-account-reason" className="m-0 text-meta text-text-muted">
            {reason}
          </p>
        )}
      </div>
    </Panel>
  );
}
