"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { apiCall } from "@/lib/api-client";

type Phase = "before" | "confirming" | "done" | "invalid" | "server" | "network";

// Programmatic focus on a result region is announced; the region is not interactive.
const FOCUS_TARGET = "outline-none";

export function ConfirmEmailChange({ token }: { token: string | undefined }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(token ? "before" : "invalid");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [focusResult, setFocusResult] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (focusResult) resultRef.current?.focus();
  }, [focusResult, phase]);

  async function onConfirm() {
    setPhase("confirming");
    const result = await apiCall<null>("/api/auth/email-change/confirm", { body: { token } });
    setFocusResult(true);
    if (result.ok) {
      setPhase("done");
      // The change ended every session, this one too: the bar in the shared layout must drop the menu.
      router.refresh();
      return;
    }
    const { code } = result.error;
    // A malformed token is a broken link, the same to the player as an expired one.
    if (code === "INVALID_TOKEN" || code === "VALIDATION") setPhase("invalid");
    else setPhase(code === "network" ? "network" : "server");
  }

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className={`m-0 text-section font-strong ${FOCUS_TARGET}`}>
        Potwierdź nowy adres e-mail
      </h1>
      {phase === "done" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="change-confirm-done">
          <Alert status="success" title="Adres e-mail został zmieniony" />
          <p className="m-0 text-body text-text-secondary">Ze względów bezpieczeństwa wylogowaliśmy Cię ze wszystkich urządzeń.</p>
          <div>
            <Button asChild>
              <a href="/login">Zaloguj się</a>
            </Button>
          </div>
        </div>
      ) : phase === "server" || phase === "network" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="change-confirm-error">
          <Alert status="danger" title={phase === "server" ? "Nie udało się zmienić adresu" : "Brak połączenia"}>
            {phase === "server" ? "Spróbuj ponownie." : "Nie udało się połączyć z serwerem. Spróbuj ponownie."}
          </Alert>
          <div>
            <Button variant="secondary" onClick={onConfirm}>
              Spróbuj ponownie
            </Button>
          </div>
        </div>
      ) : phase === "invalid" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="change-confirm-invalid">
          <Alert status="danger" title="Link wygasł lub został już użyty." />
          <p className="m-0 text-body text-text-secondary">Adres konta pozostał bez zmian. Zaloguj się i poproś o zmianę adresu jeszcze raz.</p>
          <div>
            <Button asChild variant="secondary">
              <a href="/login?next=%2Faccount">Zaloguj się</a>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="m-0 text-body text-text-secondary">
            Kliknij przycisk, aby ustawić ten adres jako adres e-mail konta. Pozostałe urządzenia zostaną wylogowane.
          </p>
          <div>
            <Button loading={phase === "confirming"} onClick={onConfirm} data-testid="change-confirm-button">
              Potwierdź nowy adres
            </Button>
          </div>
        </>
      )}
    </>
  );
}
