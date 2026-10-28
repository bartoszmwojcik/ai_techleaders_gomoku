"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useRef, useState } from "react";

import { apiCall } from "@/lib/api-client";

type Phase = "before" | "confirming" | "done" | "invalid" | "server" | "network";

type ConfirmEmailProps = {
  /** From the address; missing means a broken link (s03.7). */
  token: string | undefined;
  /** Already passed through `safeNextPath` by the page. */
  nextPath: string;
  signedIn: boolean;
  alreadyVerified: boolean;
};

const INVALID_TITLE = "Link wygasł lub został już użyty.";

// Programmatic focus on a result region is announced; the region is not interactive, so its
// own outline is hidden. Fields and buttons keep the focus ring.
const FOCUS_TARGET = "outline-none";

export function ConfirmEmail({ token, nextPath, signedIn, alreadyVerified }: ConfirmEmailProps) {
  const [phase, setPhase] = useState<Phase>(token ? "before" : "invalid");
  const [next, setNext] = useState(nextPath);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [focusResult, setFocusResult] = useState(false);

  // Entering the page from a mail link: start at the heading, so a screen reader reads it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // After the outcome of a click the result (success, error) gets the focus.
  useEffect(() => {
    if (focusResult) resultRef.current?.focus();
  }, [focusResult, phase]);

  async function onConfirm() {
    setPhase("confirming");
    const result = await apiCall<{ next: string }>("/api/auth/email-verification/confirm", {
      body: { token, next: nextPath },
    });
    setFocusResult(true);
    if (result.ok) {
      setNext(result.data.next);
      setPhase("done");
      return;
    }
    const { code } = result.error;
    // A malformed token is a broken link, the same to the player as an expired one.
    if (code === "INVALID_TOKEN" || code === "VALIDATION") setPhase("invalid");
    else setPhase(code === "network" ? "network" : "server");
  }

  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className={`m-0 text-section font-strong ${FOCUS_TARGET}`}>
        Potwierdź adres e-mail
      </h1>
      {phase === "done" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="verify-done">
          <Alert status="success" title="Adres potwierdzony" />
          {signedIn ? (
            <div>
              <Button asChild>
                <a href={next}>Przejdź dalej</a>
              </Button>
            </div>
          ) : (
            <p className="m-0 text-body text-text-secondary">
              Nie jesteś zalogowany na tym urządzeniu.{" "}
              <TextLink href={loginHref}>Zaloguj się</TextLink>, aby zagrać.
            </p>
          )}
        </div>
      ) : phase === "server" || phase === "network" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="verify-error">
          <Alert
            status="danger"
            title={phase === "server" ? "Nie udało się potwierdzić adresu" : "Brak połączenia"}
          >
            {phase === "server" ? "Spróbuj ponownie." : "Nie udało się połączyć z serwerem. Spróbuj ponownie."}
          </Alert>
          <div>
            <Button variant="secondary" onClick={onConfirm}>
              Spróbuj ponownie
            </Button>
          </div>
        </div>
      ) : phase === "invalid" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="verify-invalid">
          <Alert status="danger" title={INVALID_TITLE} />
          {alreadyVerified && (
            <>
              <p className="m-0 text-body text-text-secondary">Adres jest już potwierdzony.</p>
              <div>
                <Button asChild>
                  <a href={nextPath}>Przejdź dalej</a>
                </Button>
              </div>
            </>
          )}
          {!alreadyVerified && (
            <TextLink href="/" placement="standalone">
              Wróć na stronę główną
            </TextLink>
          )}
        </div>
      ) : (
        <>
          <p className="m-0 text-body text-text-secondary">
            Kliknij przycisk, aby potwierdzić adres e-mail konta, dla którego wysłaliśmy ten link.
          </p>
          <div>
            <Button loading={phase === "confirming"} onClick={onConfirm}>
              Potwierdź e-mail
            </Button>
          </div>
        </>
      )}
    </>
  );
}
