import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useState, type FormEvent } from "react";

import { go, Main, SiteHeader, useScreenEnter } from "../chrome";
import { submitCode, useSim } from "../sim";
import { useStateId } from "../stateId";

// p02 Kod zaproszenia `/join` (map p02.1–p02.5, game-invitations #21 UI, Q12, Q13). Open to everyone.

export function P02Join() {
  const sim = useSim();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setCode("");
    setError(null);
    setLimited(false);
  }, [sim.epoch]);
  useScreenEnter("p02", () => setLimited(false));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (checking) return;
    setError(null);
    setLimited(false);
    setChecking(true);
    const result = await submitCode(code);
    setChecking(false);
    if (result.kind === "short") {
      setError("Sprawdź kod: ma 8 znaków.");
      document.getElementById("join-code")?.focus();
    } else if (result.kind === "limit") {
      setLimited(true);
      document.getElementById("join-code")?.focus();
    } else {
      // p02.4: a code that points to nothing valid is shown on the invitation page as "nieważne" (s07.9).
      setCode("");
      go("s07");
    }
  }

  const stateId = checking ? "p02.5" : limited ? "p02.3" : error ? "p02.2" : "p02.1";
  useStateId("p02", stateId);

  return (
    <>
      <SiteHeader />
      <Main narrow state={stateId}>
        <h1 className="m-0 text-section font-strong">Masz kod zaproszenia?</h1>
        {limited && (
          <Alert status="danger" title="Zbyt wiele prób">
            Spróbuj za chwilę.
          </Alert>
        )}
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="join-form">
          <Field id="join-code" label="Kod zaproszenia" hint="8 znaków. Wielkość liter i myślnik nie mają znaczenia." error={error} required>
            {(control) => (
              <TextInput
                {...control}
                autoComplete="off"
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABCD-EFGH"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={checking}>{checking ? "Sprawdzanie kodu…" : "Dalej"}</Button>
        </form>
        <p className="m-0 text-body text-text-secondary"><TextLink href="#p01">Wróć na stronę główną</TextLink></p>
      </Main>
    </>
  );
}
