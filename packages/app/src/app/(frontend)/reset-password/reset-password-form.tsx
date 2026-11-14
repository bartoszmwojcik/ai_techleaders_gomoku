"use client";

import { passwordResetConfirmSchema } from "@gomoku/core/validators/auth/password-reset-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import plAuth from "@/i18n/catalogs/pl/auth";
import plCommon from "@/i18n/catalogs/pl/common";
import { textsOf, type TextsProps } from "@/i18n/client";
import { SubmitButton } from "@/components/forms/submit-button";
import { apiCall } from "@/lib/api-client";
import { fieldMessages, localFieldMessages, type ErrorTexts } from "@/lib/api-error-text";

const PASSWORD_ID = "reset-new-password";

type Phase = "form" | "invalid" | "done";
type GeneralError = { title: string; details: string };

// Programmatic focus on a result region is announced; the region is not interactive, so its
// own outline is hidden. Fields and buttons keep the focus ring.
const FOCUS_TARGET = "outline-none";

type Props = TextsProps<"auth"> & {
  token: string | undefined;
  /** The `common` namespace (the limit message); nothing in Polish. */
  commonTexts?: TextsProps<"common">;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

export function ResetPasswordForm({ token, commonTexts = {}, errorTexts = {}, ...texts }: Props) {
  const t = textsOf<"auth">(plAuth, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const router = useRouter();
  // No token in the address is a broken link: the form could never succeed.
  const [phase, setPhase] = useState<Phase>(token ? "form" : "invalid");
  const [password, setPassword] = useState("");
  // Remounting the field hides the password again (after a failure and after success).
  const [passwordKey, setPasswordKey] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [pending, setPending] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  useEffect(() => {
    if (phase !== "form") resultRef.current?.focus();
  }, [phase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setGeneral(null);

    // Same schema as the route: a too short password costs no attempt of the limit.
    const input = { token: token as string, newPassword: password };
    const parsed = passwordResetConfirmSchema.safeParse(input);
    if (!parsed.success) {
      setError(localFieldMessages(errorTexts, ["newPassword"], parsed.error, "reset").newPassword);
      setFocusTarget({ id: PASSWORD_ID });
      return;
    }

    setPending(true);
    const result = await apiCall<null>("/api/auth/password-reset/confirm", { body: input });
    setPending(false);

    if (result.ok) {
      setPassword("");
      setPasswordKey((key) => key + 1);
      setPhase("done");
      // Every session has just ended, also one in this browser: the bar in the shared layout must drop the menu.
      router.refresh();
      return;
    }

    const { code, retryAfterSeconds } = result.error;
    const fieldError = fieldMessages(errorTexts, ["newPassword"], result.error, "reset").newPassword;
    // A malformed token is a broken link, the same to the player as an expired one.
    if (code === "INVALID_TOKEN" || (code === "VALIDATION" && !fieldError)) {
      setPhase("invalid");
      return;
    }
    if (fieldError) {
      setError(fieldError);
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds, common));
    } else if (code === "network") {
      setGeneral({
        title: t("shared.networkTitle"),
        details: t("reset.network"),
      });
    } else {
      setGeneral({ title: t("reset.failed"), details: t("shared.retry") });
    }
    setFocusTarget({ id: PASSWORD_ID });
  }

  if (phase === "done") {
    return (
      <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="reset-done">
        <Alert status="success" role="status" title={t("reset.doneTitle")}>
          {t("reset.doneBody")}
        </Alert>
        <div>
          <Button asChild>
            <a href="/login">{t("reset.login")}</a>
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div ref={resultRef} tabIndex={-1} className={`flex flex-col gap-stack ${FOCUS_TARGET}`} data-testid="reset-invalid">
        <Alert status="danger" title={t(token ? "reset.expired" : "reset.incomplete")}>
          {t("reset.unchanged")}
        </Alert>
        <TextLink href="/forgot-password" placement="standalone">
          {t("reset.newLink")}
        </TextLink>
      </div>
    );
  }

  return (
    <>
      {general && (
        <div data-testid="reset-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="reset-form">
        <PasswordField
          key={passwordKey}
          id={PASSWORD_ID}
          name="newPassword"
          autoComplete="new-password"
          label={t("fields.newPassword")}
          showLabel={t("fields.showPassword")}
          hideLabel={t("fields.hidePassword")}
          hint={t("fields.passwordHint")}
          error={error}
          required
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel={t("reset.pending")}>
          {t("reset.submit")}
        </SubmitButton>
      </form>
    </>
  );
}
