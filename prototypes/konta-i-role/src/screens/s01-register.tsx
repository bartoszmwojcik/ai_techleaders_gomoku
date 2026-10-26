import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useState, type FormEvent } from "react";

import { go, Main, SiteHeader, useScreenEnter } from "../chrome";
import { adoptOtherTabSession, register, safeNext, setNext, useSim, viewer, type RegisterErrors, getSim } from "../sim";

type General = { title: string; text: string; refresh?: boolean } | null;

export function S01Register() {
  const sim = useSim();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordKey, setPasswordKey] = useState(0);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [general, setGeneral] = useState<General>(null);
  const [conflictEmail, setConflictEmail] = useState(false);
  const [sending, setSending] = useState(false);

  // s01.11: a signed-in player is sent to the home page.
  useScreenEnter("s01", () => {
    if (viewer(getSim())) go("s04");
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setErrors({});
    setGeneral(null);
    setConflictEmail(false);
    const result = await register({ email, name, password });
    setSending(false);
    setPasswordKey((key) => key + 1);
    setPassword("");
    switch (result.kind) {
      case "ok": {
        const next = safeNext(sim.next);
        setNext(null);
        setEmail("");
        setName("");
        go(next ?? "s04");
        return;
      }
      case "validation":
        setErrors(result.errors);
        setTimeout(() => {
          const first = result.errors.email ? "reg-email" : result.errors.name ? "reg-name" : "reg-password";
          document.getElementById(first)?.focus();
        }, 0);
        return;
      case "conflict-name":
        setErrors({ name: "Ta nazwa jest zajęta. Wybierz inną." });
        setTimeout(() => document.getElementById("reg-name")?.focus(), 0);
        return;
      case "conflict-email":
        setConflictEmail(true);
        return;
      case "limit":
        setGeneral({ title: "Zbyt wiele prób", text: "Spróbuj ponownie za 12 min." });
        return;
      case "server":
        setGeneral({ title: "Nie udało się założyć konta", text: "Spróbuj ponownie." });
        return;
      case "already":
        // s01.9 / s02.12: wording is an assumption (map L04).
        setGeneral({ title: "Jesteś już zalogowany", text: "Sesja jest aktywna w innej karcie.", refresh: true });
        return;
      case "network":
        setGeneral({ title: "Brak połączenia", text: "Nie udało się połączyć z serwerem. Wpisane dane zostały zachowane, poza hasłem. Spróbuj ponownie." });
        return;
    }
  }

  const guestBlocked = sim.guestGame;
  const unavailable = sim.scenario.provider === "none";

  return (
    <>
      <SiteHeader />
      <Main narrow>
        <h1 className="m-0 text-section font-strong">Załóż konto</h1>
        {guestBlocked ? (
          // s01.13 (L14, L23, L26): a guest with a running game can neither register nor log in. The wording is an assumption (A-02).
          <Alert status="warning" title="Trwa Twoja partia jako gość">
            Dokończ ją, zanim założysz konto.
          </Alert>
        ) : unavailable ? (
          // s01.12 (L03): registration needs working mail. The wording is an assumption (A-02).
          <Alert status="warning" title="Rejestracja jest chwilowo niedostępna">
            Nie możemy teraz wysłać wiadomości z linkiem potwierdzającym. Spróbuj później.
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
            {conflictEmail && (
              <Alert status="danger" title="Nie udało się założyć konta">
                Jeśli masz już konto, <TextLink href="#s02">zaloguj się</TextLink>.
              </Alert>
            )}
            <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="register-form">
              <Field id="reg-email" label="E-mail" required error={errors.email}>
                {(control) => <TextInput {...control} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
              <Field id="reg-name" label="Nazwa gracza" hint="Widzą ją Twoi przeciwnicy." error={errors.name} required>
                {(control) => <TextInput {...control} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <PasswordField
                key={passwordKey}
                id="reg-password"
                label="Hasło"
                showLabel="Pokaż hasło"
                hideLabel="Ukryj hasło"
                autoComplete="new-password"
                hint="Co najmniej 16 znaków"
                error={errors.password}
                required
                value={password}
                onChange={setPassword}
              />
              <Button type="submit" loading={sending}>{sending ? "Zakładanie konta…" : "Załóż konto"}</Button>
            </form>
            <p className="m-0 text-body text-text-secondary">
              Masz już konto? <TextLink href="#s02">Zaloguj się</TextLink>
            </p>
          </>
        )}
      </Main>
    </>
  );
}
