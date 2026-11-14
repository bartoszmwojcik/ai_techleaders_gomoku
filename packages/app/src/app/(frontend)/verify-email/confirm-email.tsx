"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useRef, useState } from "react";

import plAuth from "@/i18n/catalogs/pl/auth";
import { textsOf, type TextsProps } from "@/i18n/client";
import { withNodes } from "@/i18n/rich";
import { apiCall } from "@/lib/api-client";
import {
  LOGIN_TO_RESEND_HREF,
  requestNewLink,
  resendFeedback,
  type ResendState,
} from "@/components/auth/resend-verification";

type Phase = "before" | "confirming" | "done" | "invalid" | "server" | "network";

type ConfirmEmailProps = TextsProps<"auth"> & {
  /** From the address; missing means a broken link (s03.7). */
  token: string | undefined;
  /** Already passed through `safeNextPath` by the page. */
  nextPath: string;
  signedIn: boolean;
  alreadyVerified: boolean;
};

// Programmatic focus on a result region is announced; the region is not interactive, so its
// own outline is hidden. Fields and buttons keep the focus ring.
const FOCUS_TARGET = "outline-none";

export function ConfirmEmail({ token, nextPath, signedIn, alreadyVerified, ...texts }: ConfirmEmailProps) {
  const t = textsOf<"auth">(plAuth, texts);
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
    setResend(await requestNewLink());
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

  const feedback = resendFeedback(resend, t);
  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className={`m-0 text-section font-strong ${FOCUS_TARGET}`}>
        {t("verify.heading")}
      </h1>
      {phase === "done" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="verify-done">
          <Alert status="success" title={t("verify.doneTitle")} />
          {signedIn ? (
            <div>
              <Button asChild>
                <a href={next}>{t("verify.goOn")}</a>
              </Button>
            </div>
          ) : (
            <p className="m-0 text-body text-text-secondary">
              {withNodes(t("verify.notSignedIn", { link: "{link}" }), {
                link: <TextLink href={loginHref}>{t("verify.login")}</TextLink>,
              })}
            </p>
          )}
        </div>
      ) : phase === "server" || phase === "network" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="verify-error">
          <Alert
            status="danger"
            title={t(phase === "server" ? "verify.failed" : "shared.networkTitle")}
          >
            {t(phase === "server" ? "shared.retry" : "verify.network")}
          </Alert>
          <div>
            <Button variant="secondary" onClick={onConfirm}>
              {t("verify.retryButton")}
            </Button>
          </div>
        </div>
      ) : phase === "invalid" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="verify-invalid">
          <Alert status="danger" title={t("verify.invalid")} />
          {alreadyVerified && (
            <>
              <p className="m-0 text-body text-text-secondary">{t("verify.already")}</p>
              <div>
                <Button asChild>
                  <a href={nextPath}>{t("verify.goOn")}</a>
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
                    {t("verify.newLink")}
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
                {t("verify.loginToResend")}
              </TextLink>
            ))}
        </div>
      ) : (
        <>
          <p className="m-0 text-body text-text-secondary">
            {t("verify.intro")}
          </p>
          <div>
            <Button loading={phase === "confirming"} onClick={onConfirm}>
              {t("verify.confirm")}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
