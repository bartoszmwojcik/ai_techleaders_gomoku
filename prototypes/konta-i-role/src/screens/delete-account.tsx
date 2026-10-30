import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Checkbox } from "@gomoku/ui/game/checkbox";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { Panel } from "@gomoku/ui/game/panel";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { useRef, useState } from "react";

import { go, OutsideLink } from "../chrome";
import { deleteAccount, setNext, useSim, viewer } from "../sim";

type Phase = "idle" | "asking" | "deleting";
type General = { title: string; text: string } | null;

const SERVER_ERROR = "Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie.";

/**
 * "Usuń konto" on /account (spec 2026-10-24-account-deletion.md, "UI/UX"), states s05.10–s05.20.
 * The password sits in the panel, not in the dialog (open question O5): ConfirmDialog has only a description (LUKA DU1).
 */
export function DeleteAccountSection() {
  const sim = useSim();
  const account = viewer(sim);
  const [password, setPassword] = useState("");
  const [passwordKey, setPasswordKey] = useState(0);
  const [checked, setChecked] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [general, setGeneral] = useState<General>(null);
  const [dialogError, setDialogError] = useState(false);
  const sending = useRef(false);
  const blockRef = useRef<HTMLDivElement>(null);

  if (!account) return null;
  const { active, waiting } = sim.accountView;
  const reason = active
    ? "Usunięcie jest możliwe dopiero po zakończeniu partii."
    : !checked
      ? "Zaznacz potwierdzenie, aby usunąć konto."
      : null;

  // Delayed: Radix returns focus to the trigger when the dialog closes, and the password field must win.
  const focusPassword = () => setTimeout(() => document.getElementById("delete-account-password")?.focus(), 80);

  function ask() {
    setGeneral(null);
    setDialogError(false);
    if (!password) {
      // s05.16b: an empty password is caught before the dialog (assumption A-D2; the server would answer 400 VALIDATION).
      setFieldError("Wpisz hasło.");
      focusPassword();
      return;
    }
    setFieldError(undefined);
    setPhase("asking");
  }

  async function confirm() {
    // The ref blocks a second send in the same tick, before the button shows its busy state (lesson 2026-10-29).
    if (sending.current) return;
    sending.current = true;
    setPhase("deleting");
    setDialogError(false);
    const result = await deleteAccount(password);
    sending.current = false;
    switch (result.kind) {
      case "ok":
        // Full reload on /?notice=account-deleted: the layout reads the session (s04.14).
        setPhase("idle");
        go("s04");
        return;
      case "wrong-password":
        setPhase("idle");
        setPassword("");
        setPasswordKey((key) => key + 1);
        // No detail about the account; the counter only warns when the limit is near (assumption A-D5).
        setFieldError(
          result.attemptsLeft <= 3
            ? `Nieprawidłowe hasło. Zostało prób: ${result.attemptsLeft}, potem blokada na 15 minut.`
            : "Nieprawidłowe hasło.",
        );
        focusPassword();
        return;
      case "limit":
        setPhase("idle");
        setGeneral({ title: "Zbyt wiele prób", text: `Spróbuj ponownie za ${result.minutes} min.` });
        return;
      case "active-game":
        setPhase("idle");
        setFieldError(undefined);
        setTimeout(() => blockRef.current?.focus(), 0);
        return;
      case "unauthorized":
        // s05.19: the session is gone; the login page brings the player back here.
        setPhase("idle");
        setNext("s05");
        go("s02");
        return;
      case "server":
      case "network":
        // s05.18: the dialog stays open and nothing was changed.
        setPhase("asking");
        setDialogError(true);
        return;
    }
  }

  // LUKA DU2: no "danger zone" pattern in the design system; this is a Panel with a status-danger border.
  return (
    <Panel title="Usuń konto" className="max-w-xl border-status-danger" data-testid="delete-account-panel">
      <Alert status="warning" title="Tego nie da się cofnąć" role="none">
        <p className="m-0">Twoje konto, e-mail i hasło zostaną usunięte od razu i na zawsze. Twoje zakończone partie zostaną u przeciwników jako „Usunięty gracz”.</p>
        {waiting && <p className="m-0 mt-group" data-testid="delete-account-waiting">Twoja oczekująca partia i jej zaproszenie zostaną usunięte.</p>}
      </Alert>
      {active && (
        <div ref={blockRef} tabIndex={-1} className="focus-visible:focus-ring" data-testid="delete-account-active-game">
          <Alert status="warning" title="Najpierw dokończ albo poddaj partię.">
            Masz partię w toku. Na stronie partii wybierz „Poddaj partię”, a potem odśwież tę stronę.{" "}
            <OutsideLink name="Strona partii">Przejdź do partii</OutsideLink>
          </Alert>
        </div>
      )}
      {general && (
        <div data-testid="delete-account-error">
          <Alert status="danger" title={general.title}>{general.text}</Alert>
        </div>
      )}
      <PasswordField
        key={passwordKey}
        id="delete-account-password"
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
          // The button is the dialog's trigger, so focus returns to it on close (spec: "fokus wraca na przycisk").
          // Esc and the way out are blocked while the server works, as in the resignation dialog.
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
        title={`Usunąć konto ${account.name}?`}
        description={
          <>
            <span className="block">
              Twoje zakończone partie zostaną u przeciwników jako „Usunięty gracz”. Tego nie da się cofnąć.
              {waiting ? " Twoja oczekująca partia i jej zaproszenie zostaną usunięte." : ""}
            </span>
            {/* LUKA DU1: ConfirmDialog has no slot for an error; the message is part of the description. */}
            {dialogError && <span role="alert" className="mt-group block font-strong text-status-danger">{SERVER_ERROR}</span>}
          </>
        }
        confirmLabel="Usuń konto na zawsze"
        cancelLabel="Zostaw konto"
        confirming={phase === "deleting"}
        onConfirm={() => void confirm()}
      />
        {reason && <p id="delete-account-reason" className="m-0 text-meta text-text-muted">{reason}</p>}
      </div>
    </Panel>
  );
}
