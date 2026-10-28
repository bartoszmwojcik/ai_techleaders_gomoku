"use client";

import { toValidationError } from "@gomoku/core/http/zod-error";
import { passwordResetConfirmSchema } from "@gomoku/core/validators/auth/password-reset-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { apiCall } from "@/lib/api-client";

const PASSWORD_ID = "reset-new-password";

type Phase = "form" | "invalid" | "done";
type GeneralError = { title: string; details: string };

// Programmatic focus on a result region is announced; the region is not interactive, so its
// own outline is hidden. Fields and buttons keep the focus ring.
const FOCUS_TARGET = "outline-none";

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  // No token in the address is a broken link: the form could never succeed.
  const [phase, setPhase] = useState<Phase>(token ? "form" : "invalid");
  const [password, setPassword] = useState("");
  // Remounting the field hides the password again (after a failure and after success).
  const [passwordKey, setPasswordKey] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [pending, setPending] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  useEffect(() => {
    if (phase !== "form") resultRef.current?.focus();
  }, [phase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setGeneral(null);

    // Same schema as the route: a too short password costs no attempt of the limit.
    const input = { token: token as string, newPassword: password };
    const parsed = passwordResetConfirmSchema.safeParse(input);
    if (!parsed.success) {
      setError(toValidationError(parsed.error)?.fieldErrors?.newPassword?.[0]);
      setFocusTarget({ id: PASSWORD_ID });
      return;
    }

    setPending(true);
    const result = await apiCall<null>("/api/auth/password-reset/confirm", { body: input });
    setPending(false);

    if (result.ok) {
      setPassword("");
      setPasswordKey((key) => key + 1);
      setPhase("done");
      return;
    }

    const { code, retryAfterSeconds, fieldErrors } = result.error;
    const fieldError = fieldErrors?.newPassword?.[0];
    // A malformed token is a broken link, the same to the player as an expired one.
    if (code === "INVALID_TOKEN" || (code === "VALIDATION" && !fieldError)) {
      setPhase("invalid");
      return;
    }
    if (fieldError) {
      setError(fieldError);
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds));
    } else if (code === "network") {
      setGeneral({
        title: "Brak połączenia",
        details: "Nie udało się połączyć z serwerem. Wpisane hasło zostało zachowane. Spróbuj ponownie.",
      });
    } else {
      setGeneral({ title: "Nie udało się zmienić hasła", details: "Spróbuj ponownie." });
    }
    setFocusTarget({ id: PASSWORD_ID });
  }

  if (phase === "done") {
    return (
      <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="reset-done">
        <Alert status="success" role="status" title="Hasło zmienione">
          Zaloguj się nowym hasłem. Wszystkie dotychczasowe sesje zostały wylogowane.
        </Alert>
        <div>
          <Button asChild>
            <a href="/login">Zaloguj się</a>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="reset-invalid">
        <Alert status="danger" title={token ? "Link wygasł lub został już użyty" : "Ten link jest niepełny"}>
          Hasło nie zostało zmienione. Poproś o nowy link.
        </Alert>
        <TextLink href="/forgot-password" placement="standalone">
          Wyślij nowy link
        </TextLink>
      </div>
    );
  }

  return (
    <>
      {general && (
        <div data-testid="reset-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="reset-form">
        <PasswordField
          key={passwordKey}
          id={PASSWORD_ID}
          name="newPassword"
          autoComplete="new-password"
          label="Nowe hasło"
          showLabel="Pokaż hasło"
          hideLabel="Ukryj hasło"
          hint="Co najmniej 8 znaków"
          error={error}
          required
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel="Zapisywanie…">
          Ustaw nowe hasło
        </SubmitButton>
      </form>
    </>
  );
}
