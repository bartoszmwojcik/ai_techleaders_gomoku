"use client";

import { toValidationError } from "@gomoku/core/http/zod-error";
import { passwordChangeSchema } from "@gomoku/core/validators/auth/password-change-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { useEffect, useState, type FormEvent } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { apiCall } from "@/lib/api-client";

type FieldName = "currentPassword" | "newPassword";
type FieldMessages = Partial<Record<FieldName, string>>;
type GeneralError = { title: string; details: string };

const FIELD_ORDER: FieldName[] = ["currentPassword", "newPassword"];
const FIELD_IDS: Record<FieldName, string> = {
  currentPassword: "change-current-password",
  newPassword: "change-new-password",
};

const GENERIC_ERROR: GeneralError = { title: "Nie udało się zmienić hasła", details: "Spróbuj ponownie." };

function firstMessages(fieldErrors: Record<string, string[]> | undefined): FieldMessages {
  const messages: FieldMessages = {};
  for (const field of FIELD_ORDER) {
    const message = fieldErrors?.[field]?.[0];
    if (message) messages[field] = message;
  }
  return messages;
}

function rateLimitedError(retryAfterSeconds: number | undefined): GeneralError {
  const minutes = retryAfterSeconds === undefined ? undefined : Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return {
    title: "Zbyt wiele prób",
    details: minutes === undefined ? "Spróbuj ponownie za jakiś czas." : `Spróbuj ponownie za ${minutes} min.`,
  };
}

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // Remounting a password field hides the password again.
  const [currentKey, setCurrentKey] = useState(0);
  const [newKey, setNewKey] = useState(0);
  const [errors, setErrors] = useState<FieldMessages>({});
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, setPending] = useState(false);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  function showFieldErrors(messages: FieldMessages) {
    setErrors(messages);
    // Callers pass at least one message, so there is always a first invalid field.
    setFocusTarget({ id: FIELD_IDS[FIELD_ORDER.find((field) => messages[field]) as FieldName] });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneral(null);
    setChanged(false);

    // Same schema as the route: a malformed form costs no attempt of the limit.
    const input = { currentPassword, newPassword };
    const parsed = passwordChangeSchema.safeParse(input);
    if (!parsed.success) {
      showFieldErrors(firstMessages(toValidationError(parsed.error)?.fieldErrors));
      return;
    }

    setPending(true);
    const result = await apiCall<null>("/api/auth/password", { body: input });
    setPending(false);

    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setCurrentKey((key) => key + 1);
      setNewKey((key) => key + 1);
      setChanged(true);
      return;
    }

    const { code, retryAfterSeconds, fieldErrors } = result.error;
    const messages = firstMessages(fieldErrors);
    if (code === "INVALID_CURRENT_PASSWORD") {
      // Only the wrong password is cleared (and hidden again); the new one stays.
      setCurrentPassword("");
      setCurrentKey((key) => key + 1);
    }
    if (Object.keys(messages).length > 0) {
      showFieldErrors(messages);
      return;
    }
    if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds));
    } else if (code === "network") {
      setGeneral({
        title: "Brak połączenia",
        details: "Nie udało się połączyć z serwerem. Wpisane dane zostały zachowane. Spróbuj ponownie.",
      });
    } else {
      setGeneral(GENERIC_ERROR);
    }
    // The error has no field of its own: focus the current password.
    setFocusTarget({ id: FIELD_IDS.currentPassword });
  }

  return (
    <>
      {changed && (
        <div data-testid="change-password-success">
          <Alert status="success" role="status" title="Hasło zmienione">
            Inne urządzenia zostały wylogowane.
          </Alert>
        </div>
      )}
      {general && (
        <div data-testid="change-password-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="change-password-form">
        <PasswordField
          key={`current-${currentKey}`}
          id={FIELD_IDS.currentPassword}
          name="currentPassword"
          autoComplete="current-password"
          label="Obecne hasło"
          showLabel="Pokaż hasło"
          hideLabel="Ukryj hasło"
          error={errors.currentPassword}
          required
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <PasswordField
          key={`new-${newKey}`}
          id={FIELD_IDS.newPassword}
          name="newPassword"
          autoComplete="new-password"
          label="Nowe hasło"
          showLabel="Pokaż hasło"
          hideLabel="Ukryj hasło"
          hint="Co najmniej 8 znaków"
          error={errors.newPassword}
          required
          value={newPassword}
          onChange={setNewPassword}
        />
        <Alert status="warning" role="status" title="Wylogowanie z innych urządzeń">
          Inne urządzenia zostaną wylogowane, także w trakcie partii.
        </Alert>
        <SubmitButton pending={pending} pendingLabel="Zmienianie hasła…">
          Zmień hasło
        </SubmitButton>
      </form>
    </>
  );
}
