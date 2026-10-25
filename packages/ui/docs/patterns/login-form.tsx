import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { useEffect, useRef, useState, type FormEvent } from "react";

// The "Formularz" pattern as a working example (login). It lives in the docs, not in the package:
// it shows how the real components fit together; the rules are written on the pattern page.

export type LoginValues = { email: string; password: string };
export type LoginErrors = Partial<Record<keyof LoginValues, string>>;
export type LoginOutcome =
  | { ok: true }
  | { ok: false; fieldErrors?: LoginErrors; message?: string };

type Phase = "idle" | "submitting" | "success" | "server-error" | "offline";

const EMAIL_ERROR = "Sprawdź adres e-mail: brakuje znaku @ lub domeny.";
const PASSWORD_ERROR = "Wpisz hasło.";

function validate(values: LoginValues): LoginErrors {
  const errors: LoginErrors = {};
  if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = EMAIL_ERROR;
  if (!values.password) errors.password = PASSWORD_ERROR;
  return errors;
}

export function LoginForm({ submit }: { submit: (values: LoginValues) => Promise<LoginOutcome> }) {
  const [values, setValues] = useState<LoginValues>({ email: "", password: "" });
  const [errors, setErrors] = useState<LoginErrors>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | undefined>();
  const [passwordKey, setPasswordKey] = useState(0);
  const focusFirstError = useRef(false);

  // After a failed submit the focus goes to the first field with an error.
  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const first = (["email", "password"] as const).find((name) => errors[name]);
    if (first) document.getElementById(`login-${first}`)?.focus();
  }, [errors]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase === "submitting") return;
    const local = validate(values);
    setErrors(local);
    if (Object.keys(local).length > 0) {
      focusFirstError.current = true;
      return;
    }
    setPhase("submitting");
    try {
      const outcome = await submit(values);
      if (outcome.ok) {
        setPhase("success");
        return;
      }
      setErrors(outcome.fieldErrors ?? {});
      focusFirstError.current = Boolean(outcome.fieldErrors);
      setMessage(outcome.message);
      setPhase(outcome.fieldErrors ? "idle" : "server-error");
    } catch {
      setPhase("offline");
    } finally {
      // The typed text stays; only the password is hidden again after a send.
      setPasswordKey((key) => key + 1);
    }
  }

  if (phase === "success") {
    return <Alert status="success" title="Zalogowano">Przenosimy Cię na stronę główną.</Alert>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-sm flex-col gap-stack">
      {phase === "server-error" && (
        <Alert status="danger" title="Nie udało się zalogować">{message}</Alert>
      )}
      {phase === "offline" && (
        <Alert status="danger" title="Brak połączenia z internetem">
          Sprawdź połączenie i naciśnij „Zaloguj się” ponownie. Wpisane dane zostały.
        </Alert>
      )}
      <Field label="E-mail" id="login-email" error={errors.email} required>
        {(control) => (
          <TextInput
            {...control}
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => setValues({ ...values, email: event.target.value })}
            onBlur={() => values.email && setErrors((current) => ({ ...current, email: validate(values).email }))}
          />
        )}
      </Field>
      <PasswordField
        key={passwordKey}
        id="login-password"
        label="Hasło"
        showLabel="Pokaż hasło"
        hideLabel="Ukryj hasło"
        autoComplete="current-password"
        error={errors.password}
        required
        value={values.password}
        onChange={(password) => setValues((current) => ({ ...current, password }))}
      />
      <Button type="submit" loading={phase === "submitting"}>
        Zaloguj się
      </Button>
    </form>
  );
}
