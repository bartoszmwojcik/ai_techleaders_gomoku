"use client";

import { toValidationError } from "@gomoku/core/http/zod-error";
import { passwordResetRequestSchema } from "@gomoku/core/validators/auth/password-reset-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { apiCall } from "@/lib/api-client";

const EMAIL_ID = "forgot-email";

type GeneralError = { title: string; details: string };

// Programmatic focus on a result region is announced; the region is not interactive, so its
// own outline is hidden. Fields and buttons keep the focus ring.
const FOCUS_TARGET = "outline-none";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const sentRef = useRef<HTMLDivElement>(null);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setGeneral(null);
    setSent(false);

    // Same schema as the route: a malformed form costs no attempt of the limit.
    const parsed = passwordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(toValidationError(parsed.error)?.fieldErrors?.email?.[0]);
      setFocusTarget({ id: EMAIL_ID });
      return;
    }

    setPending(true);
    const result = await apiCall<null>("/api/auth/password-reset/request", { body: parsed.data });
    setPending(false);

    // Whatever the account is, a successful request gets the same answer: nothing tells
    // whether the address belongs to a confirmed account.
    if (result.ok) {
      setSent(true);
      return;
    }

    const { code, retryAfterSeconds, fieldErrors } = result.error;
    const fieldError = fieldErrors?.email?.[0];
    if (fieldError) {
      setError(fieldError);
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds));
    } else if (code === "network") {
      setGeneral({
        title: "Brak połączenia",
        details: "Nie udało się połączyć z serwerem. Wpisany adres został zachowany. Spróbuj ponownie.",
      });
    } else {
      setGeneral({ title: "Nie udało się wysłać prośby", details: "Spróbuj ponownie." });
    }
    setFocusTarget({ id: EMAIL_ID });
  }

  return (
    <>
      <p className="m-0 text-body text-text-secondary">
        Podaj adres e-mail konta. Jeśli jest potwierdzony, wyślemy na niego link do ustawienia nowego hasła.
      </p>
      {sent && (
        <div ref={sentRef} tabIndex={-1} className={FOCUS_TARGET} data-testid="forgot-sent">
          <Alert status="success" role="status" title="Sprawdź skrzynkę">
            Jeśli konto z tym adresem istnieje i adres jest potwierdzony, wysłaliśmy link (ważny 1 godzinę).
            Sprawdź też folder spam.
          </Alert>
        </div>
      )}
      {general && (
        <div data-testid="forgot-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="forgot-form">
        <FormField
          id={EMAIL_ID}
          name="email"
          type="email"
          autoComplete="email"
          label="E-mail"
          error={error}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <SubmitButton pending={pending} pendingLabel="Wysyłanie…">
          {sent ? "Wyślij link ponownie" : "Wyślij link"}
        </SubmitButton>
      </form>
      <TextLink href="/login" placement="standalone">
        Wróć do logowania
      </TextLink>
    </>
  );
}
