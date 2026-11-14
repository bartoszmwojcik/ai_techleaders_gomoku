"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import plAuth from "@/i18n/catalogs/pl/auth";
import { textsOf, type TextsProps } from "@/i18n/client";
import { apiCall } from "@/lib/api-client";

type Phase = "before" | "confirming" | "done" | "invalid" | "server" | "network";

// Programmatic focus on a result region is announced; the region is not interactive.
const FOCUS_TARGET = "outline-none";

export function ConfirmEmailChange({ token, ...texts }: { token: string | undefined } & TextsProps<"auth">) {
  const t = textsOf<"auth">(plAuth, texts);
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
        {t("emailChange.heading")}
      </h1>
      {phase === "done" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="change-confirm-done">
          <Alert status="success" title={t("emailChange.doneTitle")} />
          <p className="m-0 text-body text-text-secondary">{t("emailChange.doneBody")}</p>
          <div>
            <Button asChild>
              <a href="/login">{t("emailChange.login")}</a>
            </Button>
          </div>
        </div>
      ) : phase === "server" || phase === "network" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="change-confirm-error">
          <Alert status="danger" title={t(phase === "server" ? "emailChange.failed" : "shared.networkTitle")}>
            {t(phase === "server" ? "shared.retry" : "verify.network")}
          </Alert>
          <div>
            <Button variant="secondary" onClick={onConfirm}>
              {t("verify.retryButton")}
            </Button>
          </div>
        </div>
      ) : phase === "invalid" ? (
        <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="change-confirm-invalid">
          <Alert status="danger" title={t("emailChange.invalid")} />
          <p className="m-0 text-body text-text-secondary">{t("emailChange.unchanged")}</p>
          <div>
            <Button asChild variant="secondary">
              <a href="/login?next=%2Faccount">{t("emailChange.login")}</a>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="m-0 text-body text-text-secondary">
            {t("emailChange.intro")}
          </p>
          <div>
            <Button loading={phase === "confirming"} onClick={onConfirm} data-testid="change-confirm-button">
              {t("emailChange.confirm")}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
