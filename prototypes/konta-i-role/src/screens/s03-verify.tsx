import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useState } from "react";

import { go, Main, SiteHeader, useScreenEnter } from "../chrome";
import { confirmEmail, linkStatus, resend, setNext, useSim, viewer, type ResendOutcome } from "../sim";
import { resendFeedback } from "./banner";

type Phase = "before" | "confirming" | "done" | "server" | "network";

export function S03Verify() {
  const sim = useSim();
  const account = viewer(sim);
  const [phase, setPhase] = useState<Phase>("before");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ResendOutcome | null>(null);

  // Every visit from the mailbox starts at the button: opening the link changes nothing (email-verification Q3).
  useScreenEnter("s03", () => {
    setPhase("before");
    setResult(null);
  });

  const status = linkStatus(sim, sim.openedToken);

  async function onConfirm() {
    setPhase("confirming");
    const outcome = await confirmEmail(sim.openedToken);
    setPhase(outcome.kind === "ok" ? "done" : outcome.kind === "invalid" ? "before" : outcome.kind);
  }

  async function onNewLink() {
    setSending(true);
    setResult(await resend());
    setSending(false);
  }

  const feedback = result ? resendFeedback(result) : null;
  const done = phase === "done";
  const invalid = status !== "valid";

  return (
    <>
      <SiteHeader />
      <Main narrow>
        <h1 className="m-0 text-section font-strong">Potwierdź adres e-mail</h1>
        {done ? (
          <>
            <Alert status="success" title="Adres potwierdzony" />
            {account ? (
              <div><Button onClick={() => go("s04")}>Przejdź dalej</Button></div>
            ) : (
              <p className="m-0 text-body text-text-secondary">
                Nie jesteś zalogowany na tym urządzeniu. <TextLink href="#s02">Zaloguj się</TextLink>, aby zagrać.
              </p>
            )}
          </>
        ) : phase === "server" || phase === "network" ? (
          <>
            <Alert status="danger" title={phase === "server" ? "Nie udało się potwierdzić adresu" : "Brak połączenia"}>
              {phase === "server" ? "Spróbuj ponownie." : "Nie udało się połączyć z serwerem. Spróbuj ponownie."}
            </Alert>
            <div><Button variant="secondary" onClick={() => setPhase("before")}>Spróbuj ponownie</Button></div>
          </>
        ) : !invalid ? (
          <>
            <p className="m-0 text-body text-text-secondary">Kliknij przycisk, aby potwierdzić adres e-mail konta, dla którego wysłaliśmy ten link.</p>
            <div><Button loading={phase === "confirming"} onClick={onConfirm}>Potwierdź e-mail</Button></div>
          </>
        ) : (
          <>
            <Alert status="danger" title="Link wygasł lub został już użyty." />
            {account?.verified ? (
              <>
                <p className="m-0 text-body text-text-secondary">Adres jest już potwierdzony.</p>
                <div><Button onClick={() => go("s04")}>Przejdź dalej</Button></div>
              </>
            ) : account ? (
              <>
                <div><Button variant="secondary" loading={sending} disabled={result === "limited"} onClick={onNewLink}>Wyślij nowy link</Button></div>
                {feedback && (
                  <p role={feedback.state === "sent" ? "status" : "alert"} className="m-0 text-meta text-text-secondary">
                    {feedback.feedback}
                  </p>
                )}
              </>
            ) : (
              <TextLink href="#s02" placement="standalone" onClick={() => setNext("s05")}>Zaloguj się, aby wysłać nowy link</TextLink>
            )}
          </>
        )}
      </Main>
    </>
  );
}
