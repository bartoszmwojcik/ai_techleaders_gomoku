"use client";

import { toValidationError } from "@gomoku/core/http/zod-error";
import { loginSchema } from "@gomoku/core/validators/auth/login-schema";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { apiCall } from "@/lib/api-client";

type FieldName = "email" | "password";
type FieldMessages = Partial<Record<FieldName, string>>;
type GeneralError = { title: string; details: ReactNode };

const FIELD_ORDER: FieldName[] = ["email", "password"];
const FIELD_IDS: Record<FieldName, string> = { email: "login-email", password: "login-password" };

const GENERIC_ERROR: GeneralError = { title: "Nie udało się zalogować", details: "Spróbuj ponownie." };

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

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Remounting the password field hides the password again after a wrong one.
  const [passwordKey, setPasswordKey] = useState(0);
  const [errors, setErrors] = useState<FieldMessages>({});
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [pending, setPending] = useState(false);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneral(null);

    // Same schema as the route: a malformed form costs no attempt of the limit.
    const input = { email, password };
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      const messages = firstMessages(toValidationError(parsed.error)?.fieldErrors);
      setErrors(messages);
      // The schema reports at least one field, so there is always a first invalid one.
      setFocusTarget({ id: FIELD_IDS[FIELD_ORDER.find((field) => messages[field]) as FieldName] });
      return;
    }

    setPending(true);
    const result = await apiCall<{ user: { id: string; displayName: string } }>("/api/auth/login", {
      body: input,
    });
    if (result.ok) {
      // Stay pending while the page navigates, so a second submit is impossible.
      router.replace(nextPath);
      return;
    }

    setPending(false);
    const { code, retryAfterSeconds } = result.error;
    if (code === "INVALID_CREDENTIALS") {
      // Only a wrong password is cleared (and hidden again); other failures keep what was typed.
      setPassword("");
      setPasswordKey((key) => key + 1);
      // One message for an unknown e-mail and a wrong password: no field is blamed.
      setGeneral({ title: "Nieprawidłowy e-mail lub hasło", details: "Sprawdź dane i spróbuj ponownie." });
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds));
    } else if (code === "ALREADY_AUTHENTICATED") {
      setGeneral({
        title: "Jesteś już zalogowany",
        details: (
          <>
            Sesja jest aktywna w innej karcie. <TextLink href={nextPath}>Przejdź dalej</TextLink>.
          </>
        ),
      });
    } else if (code === "network") {
      setGeneral({
        title: "Brak połączenia",
        details: "Nie udało się połączyć z serwerem. Wpisane dane zostały zachowane. Spróbuj ponownie.",
      });
    } else {
      setGeneral(GENERIC_ERROR);
    }
    // The error has no field of its own: focus the password (empty after a wrong one).
    setFocusTarget({ id: FIELD_IDS.password });
  }

  const registerHref = nextPath === "/" ? "/register" : `/register?next=${encodeURIComponent(nextPath)}`;

  return (
    <>
      {general && (
        <div data-testid="login-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="login-form">
        <FormField
          id={FIELD_IDS.email}
          name="email"
          type="email"
          autoComplete="email"
          label="E-mail"
          error={errors.email}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          key={passwordKey}
          id={FIELD_IDS.password}
          name="password"
          autoComplete="current-password"
          label="Hasło"
          showLabel="Pokaż hasło"
          hideLabel="Ukryj hasło"
          error={errors.password}
          required
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel="Logowanie…">
          Zaloguj się
        </SubmitButton>
      </form>
      <p className="m-0 text-body text-text-secondary">
        <TextLink href="/forgot-password" placement="standalone">
          Nie pamiętasz hasła?
        </TextLink>
      </p>
      <p className="m-0 text-body text-text-secondary">
        Nie masz konta?{" "}
        <TextLink href={registerHref} placement="standalone">
          Załóż konto
        </TextLink>
      </p>
    </>
  );
}
