import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useState, type FormEvent } from "react";

import { go, Main, OutsideLink, SiteHeader, useScreenEnter } from "../chrome";
import { adoptOtherTabSession, login, safeNext, setNext, useSim, viewer, getSim } from "../sim";

type General = { title: string; text: string; refresh?: boolean } | null;

export function S02Login() {
  const sim = useSim();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordKey, setPasswordKey] = useState(0);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [general, setGeneral] = useState<General>(null);
  const [sending, setSending] = useState(false);

  // s02.10: a signed-in player goes straight on to `next` (or the home page).
  useScreenEnter("s02", () => {
    const current = getSim();
    if (viewer(current)) {
      const next = safeNext(current.next);
      setNext(null);
      go(next ?? "s04");
    }
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setErrors({});
    setGeneral(null);
    const result = await login(email, password);
    setSending(false);
    setPasswordKey((key) => key + 1);
    setPassword("");
    switch (result.kind) {
      case "ok": {
        const next = safeNext(sim.next);
        setNext(null);
        setEmail("");
        go(next ?? "s04");
        return;
      }
      case "invalid":
        setGeneral({ title: "Nieprawidłowy e-mail lub hasło", text: "Sprawdź dane i spróbuj ponownie." });
        return;
      case "validation":
        setErrors(result.errors);
        setTimeout(() => document.getElementById(result.errors.email ? "login-email" : "login-password")?.focus(), 0);
        return;
      case "limit":
        setGeneral({ title: "Zbyt wiele prób", text: "Spróbuj ponownie za 12 min." });
        return;
      case "server":
        setGeneral({ title: "Nie udało się zalogować", text: "Spróbuj ponownie." });
        return;
      case "already":
        // s01.9 / s02.12: wording is an assumption (map L04).
        setGeneral({ title: "Jesteś już zalogowany", text: "Sesja jest aktywna w innej karcie.", refresh: true });
        return;
      case "network":
        setGeneral({ title: "Brak połączenia", text: "Nie udało się połączyć z serwerem. Wpisany e-mail został zachowany. Spróbuj ponownie." });
        return;
    }
  }

  return (
    <>
      <SiteHeader submitForm="login-form" />
      <Main narrow>
        <h1 className="m-0 text-section font-strong">Zaloguj się</h1>
        {sim.guestGame ? (
          // s02.13 (L14, L26): a guest with a running game cannot log in until it ends. The wording is an assumption.
          <Alert status="warning" title="Trwa Twoja partia jako gość">
            Dokończ ją, zanim się zalogujesz.
          </Alert>
        ) : (
          <>
            {general && (
              <Alert status={general.refresh ? "info" : "danger"} title={general.title}>
                {general.text}
                {general.refresh && (
                  <div className="mt-group">
                    <Button variant="secondary" onClick={() => { adoptOtherTabSession(); go("s04"); }}>Odśwież stronę</Button>
                  </div>
                )}
              </Alert>
            )}
            <form id="login-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="login-form">
              <Field id="login-email" label="E-mail" required error={errors.email}>
                {(control) => <TextInput {...control} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
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
                value={password}
                onChange={setPassword}
              />
              <Button type="submit" loading={sending}>{sending ? "Logowanie…" : "Zaloguj się"}</Button>
            </form>
            <p className="m-0 text-body text-text-secondary"><OutsideLink name="Reset hasła">Nie pamiętasz hasła?</OutsideLink></p>
            <p className="m-0 text-body text-text-secondary">Nie masz konta? <TextLink href="#s01">Załóż konto</TextLink></p>
          </>
        )}
      </Main>
    </>
  );
}
