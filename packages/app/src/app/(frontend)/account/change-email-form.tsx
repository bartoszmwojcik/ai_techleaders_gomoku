"use client";

import { emailChangeSchema } from "@gomoku/core/validators/auth/profile-change-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { useEffect, useState, type FormEvent } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { apiCall } from "@/lib/api-client";
import { fullPageLoad } from "@/lib/full-page-load";

type Field = "newEmail" | "currentPassword";
type Messages = Partial<Record<Field, string>>;
type General = { title: string; details: string };

const IDS: Record<Field, string> = { newEmail: "change-new-email", currentPassword: "change-email-password" };
const ORDER: Field[] = ["newEmail", "currentPassword"];
const HINT = "Wyślemy link na nowy adres. Adres konta zmieni się po jego kliknięciu; inne urządzenia zostaną wylogowane.";

function firstMessages(fieldErrors: Record<string, string[]> | undefined): Messages {
  const messages: Messages = {};
  for (const field of ORDER) {
    const message = fieldErrors?.[field]?.[0];
    if (message) messages[field] = message;
  }
  return messages;
}

export function ChangeEmailForm() {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  // Remounting a password field hides the password again.
  const [passwordKey, setPasswordKey] = useState(0);
  const [errors, setErrors] = useState<Messages>({});
  const [general, setGeneral] = useState<General | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  // A fresh object per attempt, so focus moves again even when the same field fails twice; applied
  // after the render, because a wrong password remounts its field.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  function showErrors(messages: Messages) {
    setErrors(messages);
    setFocusTarget({ id: IDS[ORDER.find((field) => messages[field]) as Field] });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneral(null);
    setSent(false);

    const parsed = emailChangeSchema.safeParse({ newEmail, currentPassword: password });
    if (!parsed.success) {
      const messages: Messages = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        messages[field] ??= issue.message;
      }
      showErrors(messages);
      return;
    }

    setPending(true);
    const result = await apiCall<null>("/api/auth/email-change", { body: { newEmail, currentPassword: password } });
    setPending(false);

    if (result.ok) {
      // The same answer for every address (BR-16): nothing here says whether it is free.
      setNewEmail("");
      setPassword("");
      setPasswordKey((key) => key + 1);
      setSent(true);
      return;
    }
    const { code, retryAfterSeconds, fieldErrors } = result.error;
    if (code === "UNAUTHORIZED") {
      fullPageLoad(`/login?next=${encodeURIComponent("/account")}`);
      return;
    }
    const messages = firstMessages(fieldErrors);
    if (code === "INVALID_CURRENT_PASSWORD") {
      setPassword("");
      setPasswordKey((key) => key + 1);
    }
    if (Object.keys(messages).length > 0) {
      showErrors(messages);
      return;
    }
    if (code === "ADMIN_EMAIL_LOCKED") {
      setGeneral({
        title: "Nie można zmienić adresu",
        details: "Adres administratora instalacji jest ustawiony w konfiguracji serwera i nie zmienia się w aplikacji.",
      });
    } else if (code === "RATE_LIMITED") {
      const minutes = retryAfterSeconds === undefined ? undefined : Math.max(1, Math.ceil(retryAfterSeconds / 60));
      setGeneral({
        title: "Zbyt wiele prób",
        details: minutes === undefined ? "Spróbuj ponownie za jakiś czas." : `Spróbuj ponownie za ${minutes} min.`,
      });
    } else if (code === "network") {
      setGeneral({ title: "Brak połączenia", details: "Nie udało się połączyć z serwerem. Wpisane dane zostały zachowane. Spróbuj ponownie." });
    } else {
      setGeneral({ title: "Nie udało się zmienić adresu", details: "Spróbuj ponownie." });
    }
  }

  return (
    <>
      <div aria-live="polite" data-testid="change-email-live">
        {sent && (
          <div data-testid="change-email-success">
            <Alert status="success" role="status" title="Sprawdź skrzynkę">
              Jeśli ten adres może zostać użyty, wysłaliśmy na niego link (ważny 24 godziny).
            </Alert>
          </div>
        )}
      </div>
      {general && (
        <div data-testid="change-email-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="change-email-form">
        <FormField
          id={IDS.newEmail}
          name="newEmail"
          type="email"
          label="Nowy adres e-mail"
          hint={HINT}
          error={errors.newEmail}
          required
          autoComplete="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
        />
        <PasswordField
          key={`password-${passwordKey}`}
          id={IDS.currentPassword}
          name="currentPassword"
          autoComplete="current-password"
          label="Obecne hasło"
          showLabel="Pokaż hasło"
          hideLabel="Ukryj hasło"
          error={errors.currentPassword}
          required
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel="Wysyłanie linku…">
          Zmień adres e-mail
        </SubmitButton>
      </form>
    </>
  );
}
