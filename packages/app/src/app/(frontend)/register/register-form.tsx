"use client";

import { toValidationError } from "@gomoku/core/http/zod-error";
import { registerSchema } from "@gomoku/core/validators/auth/register-schema";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { apiCall } from "@/lib/api-client";

type FieldName = "email" | "displayName" | "password";
type FieldMessages = Partial<Record<FieldName, string>>;
type GeneralError = { title: string; details: ReactNode };

// Fields in the order they appear, so focus goes to the first invalid one.
const FIELD_ORDER: FieldName[] = ["email", "displayName", "password"];
const FIELD_IDS: Record<FieldName, string> = {
  email: "register-email",
  displayName: "register-display-name",
  password: "register-password",
};

const GENERIC_ERROR: GeneralError = {
  title: "Nie udało się założyć konta",
  details: "Spróbuj ponownie.",
};

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

export function RegisterForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const loginHref = nextPath === "/" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`;
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  // Remounting the password field hides the password again after every attempt.
  const [passwordKey, setPasswordKey] = useState(0);
  const [errors, setErrors] = useState<FieldMessages>({});
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [pending, setPending] = useState(false);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  // Callers pass at least one message, so there is always a first invalid field to focus.
  function showFieldErrors(messages: FieldMessages) {
    setErrors(messages);
    const first = FIELD_ORDER.find((field) => messages[field]) as FieldName;
    setFocusTarget({ id: FIELD_IDS[first] });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneral(null);

    // The same schema as the route: invalid input is caught here and costs no attempt of the limit.
    const input = { email, displayName, password };
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      showFieldErrors(firstMessages(toValidationError(parsed.error)?.fieldErrors));
      return;
    }

    setPending(true);
    const result = await apiCall<{ user: { id: string; displayName: string } }>("/api/auth/register", {
      body: input,
    });
    if (result.ok) {
      // Stay pending while the page navigates, so a second submit is impossible.
      router.replace(nextPath);
      return;
    }

    setPending(false);
    setPassword("");
    setPasswordKey((key) => key + 1);
    const { code, fieldErrors, retryAfterSeconds } = result.error;
    const messages = firstMessages(fieldErrors);
    if (Object.keys(messages).length > 0) {
      showFieldErrors(messages);
    } else if (code === "CONFLICT") {
      // Same answer for a taken e-mail, whether or not the name is taken too (no account enumeration).
      setGeneral({
        title: "Nie udało się założyć konta",
        details: (
          <>
            Jeśli masz już konto, <TextLink href={loginHref}>zaloguj się</TextLink>.
          </>
        ),
      });
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds));
    } else if (code === "ALREADY_AUTHENTICATED") {
      setGeneral({
        title: "Jesteś już zalogowany",
        details: (
          <>
            Sesja jest aktywna w innej karcie. <TextLink href="/">Przejdź na stronę główną</TextLink>.
          </>
        ),
      });
    } else if (code === "network") {
      setGeneral({
        title: "Brak połączenia",
        details:
          "Nie udało się połączyć z serwerem. Wpisane dane zostały zachowane, poza hasłem. Spróbuj ponownie.",
      });
    } else {
      setGeneral(GENERIC_ERROR);
    }
    // The password field was remounted empty; a general error has no field of its own, so focus it.
    if (Object.keys(messages).length === 0) setFocusTarget({ id: FIELD_IDS.password });
  }

  return (
    <>
      {general && (
        <div data-testid="register-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="register-form">
        <FormField
          id={FIELD_IDS.email}
          name="email"
          type="email"
          autoComplete="email"
          label="E-mail"
          hint="Używasz go do logowania."
          error={errors.email}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <FormField
          id={FIELD_IDS.displayName}
          name="displayName"
          autoComplete="nickname"
          label="Nazwa gracza"
          hint="Widzą ją Twoi przeciwnicy."
          error={errors.displayName}
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <PasswordField
          key={passwordKey}
          id={FIELD_IDS.password}
          name="password"
          autoComplete="new-password"
          label="Hasło"
          showLabel="Pokaż hasło"
          hideLabel="Ukryj hasło"
          hint="Co najmniej 8 znaków"
          error={errors.password}
          required
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel="Zakładanie konta…">
          Załóż konto
        </SubmitButton>
      </form>
      <p className="m-0 text-body text-text-secondary">
        Masz już konto?{" "}
        <TextLink href={loginHref} placement="standalone">
          Zaloguj się
        </TextLink>
      </p>
    </>
  );
}
