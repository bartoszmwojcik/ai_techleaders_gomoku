"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useRef, useState, type ReactNode } from "react";

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

/** Where a signed-out visitor goes to sign in before asking for a new link (s03.6). */
const LOGIN_TO_RESEND_HREF = "/login?next=/account";

type ResendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "limited"; retryAfterSeconds?: number }
  | { kind: "failed" }
  | { kind: "quota" }
  | { kind: "network" }
  | { kind: "already" }
  | { kind: "expired" };

/** The "try again in N min" part of the limit message: whole minutes, rounded up, at least 1. */
function waitText(retryAfterSeconds: number | undefined): string {
  return retryAfterSeconds === undefined
    ? "Spróbuj później."
    : `Spróbuj za ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min.`;
}

function resendFeedback(state: ResendState): { role: "status" | "alert"; content: ReactNode } | null {
  switch (state.kind) {
    case "sent":
      return { role: "status", content: "Wysłano. Nowy link zastępuje poprzedni." };
    case "limited":
      return { role: "alert", content: `Za wiele prób. ${waitText(state.retryAfterSeconds)}` };
    case "failed":
      return { role: "alert", content: "Nie udało się wysłać wiadomości. Spróbuj później." };
    case "quota":
      return {
        role: "alert",
        content: "Wysyłka wiadomości jest chwilowo niedostępna. Spróbuj jutro. Gra nie zależy od potwierdzenia.",
      };
    case "network":
      return { role: "alert", content: "Nie udało się połączyć z serwerem. Spróbuj ponownie." };
    case "already":
      return {
        role: "status",
        content: (
          <>
            Ten adres jest już potwierdzony.{" "}
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Odśwież stronę
            </Button>
          </>
        ),
      };
    case "expired":
      return {
        role: "alert",
        content: (
          <>
            Sesja wygasła. <TextLink href={LOGIN_TO_RESEND_HREF}>Zaloguj się</TextLink>, aby wysłać link.
          </>
        ),
      };
    default:
      return null;
  }
}

const RESEND_STATE_BY_CODE: Record<string, ResendState> = {
  EMAIL_SEND_FAILED: { kind: "failed" },
  EMAIL_QUOTA_EXCEEDED: { kind: "quota" },
  ALREADY_VERIFIED: { kind: "already" },
  UNAUTHORIZED: { kind: "expired" },
  network: { kind: "network" },
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
  const [resend, setResend] = useState<ResendState>({ kind: "idle" });
  const resendRef = useRef<HTMLParagraphElement>(null);

  // Entering the page from a mail link: start at the heading, so a screen reader reads it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // After the outcome of a click the result (success, error) gets the focus.
  useEffect(() => {
    if (focusResult) resultRef.current?.focus();
  }, [focusResult, phase]);

  // After a resend attempt the outcome text gets the focus, so it is announced and read.
  useEffect(() => {
    if (resend.kind !== "idle" && resend.kind !== "sending") resendRef.current?.focus();
  }, [resend]);

  async function onResend() {
    setResend({ kind: "sending" });
    const result = await apiCall<null>("/api/auth/email-verification/resend");
    if (result.ok) {
      setResend({ kind: "sent" });
      return;
    }
    const { code, retryAfterSeconds } = result.error;
    setResend(
      code === "RATE_LIMITED"
        ? { kind: "limited", retryAfterSeconds }
        : (RESEND_STATE_BY_CODE[code] ?? { kind: "failed" }),
    );
  }

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

  const feedback = resendFeedback(resend);
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
          {!alreadyVerified &&
            (signedIn ? (
              <>
                <div>
                  <Button
                    variant="secondary"
                    loading={resend.kind === "sending"}
                    disabled={resend.kind === "limited"}
                    onClick={onResend}
                  >
                    Wyślij nowy link
                  </Button>
                </div>
                {feedback && (
                  <p
                    ref={resendRef}
                    tabIndex={-1}
                    role={feedback.role}
                    className={`m-0 text-meta text-text-secondary ${FOCUS_TARGET}`}
                    data-testid="resend-feedback"
                  >
                    {feedback.content}
                  </p>
                )}
              </>
            ) : (
              <TextLink href={LOGIN_TO_RESEND_HREF} placement="standalone">
                Zaloguj się, aby wysłać nowy link
              </TextLink>
            ))}
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
