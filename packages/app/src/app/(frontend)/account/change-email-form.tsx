"use client";

import { emailChangeSchema } from "@gomoku/core/validators/auth/profile-change-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { useEffect, useState, type FormEvent } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import plAccount from "@/i18n/catalogs/pl/account";
import plCommon from "@/i18n/catalogs/pl/common";
import { textsOf, type TextsProps } from "@/i18n/client";
import { apiCall } from "@/lib/api-client";
import { fieldMessages, localFieldMessages, type ErrorTexts } from "@/lib/api-error-text";
import { fullPageLoad } from "@/lib/full-page-load";

type Field = "newEmail" | "currentPassword";
type Messages = Partial<Record<Field, string>>;
type General = { title: string; details: string };

const IDS: Record<Field, string> = { newEmail: "change-new-email", currentPassword: "change-email-password" };
const ORDER: Field[] = ["newEmail", "currentPassword"];

type Props = {
  /** The `account` and `common` namespaces; nothing in Polish. */
  texts?: TextsProps<"account">;
  commonTexts?: TextsProps<"common">;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

export function ChangeEmailForm({ texts = {}, commonTexts = {}, errorTexts = {} }: Props = {}) {
  const t = textsOf<"account">(plAccount, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  // Remounting a password field hides the password again.
  const [passwordKey, setPasswordKey] = useState(0);
  const [errors, setErrors] = useState<Messages>({});
  const [general, setGeneral] = useState<General | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  // A fresh object per attempt, so focus moves again even when the same field fails twice; applied
  // after the render, because a wrong password remounts its field.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  function showErrors(messages: Messages) {
    setErrors(messages);
    setFocusTarget({ id: IDS[ORDER.find((field) => messages[field]) as Field] });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneral(null);
    setSent(false);

    const parsed = emailChangeSchema.safeParse({ newEmail, currentPassword: password });
    if (!parsed.success) {
      showErrors(localFieldMessages(errorTexts, ORDER, parsed.error, "changeEmail"));
      return;
    }

    setPending(true);
    const result = await apiCall<null>("/api/auth/email-change", { body: { newEmail, currentPassword: password } });
    setPending(false);

    if (result.ok) {
      // The same answer for every address (BR-16): nothing here says whether it is free.
      setNewEmail("");
      setPassword("");
      setPasswordKey((key) => key + 1);
      setSent(true);
      return;
    }
    const { code, retryAfterSeconds } = result.error;
    if (code === "UNAUTHORIZED") {
      fullPageLoad(`/login?next=${encodeURIComponent("/account")}`);
      return;
    }
    const messages: Messages = fieldMessages(errorTexts, ORDER, result.error, "changeEmail");
    if (code === "INVALID_CURRENT_PASSWORD") {
      setPassword("");
      setPasswordKey((key) => key + 1);
    }
    if (Object.keys(messages).length > 0) {
      showErrors(messages);
      return;
    }
    if (code === "ADMIN_EMAIL_LOCKED") {
      setGeneral({
        title: t("changeEmail.adminTitle"),
        details: t("changeEmail.adminBody"),
      });
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds, common));
    } else if (code === "network") {
      setGeneral({ title: t("networkTitle"), details: t("networkKept") });
    } else {
      setGeneral({ title: t("changeEmail.failed"), details: t("retry") });
    }
  }

  return (
    <>
      <div aria-live="polite" data-testid="change-email-live">
        {sent && (
          <div data-testid="change-email-success">
            <Alert status="success" role="status" title={t("changeEmail.sentTitle")}>
              {t("changeEmail.sentBody")}
            </Alert>
          </div>
        )}
      </div>
      {general && (
        <div data-testid="change-email-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="change-email-form">
        <FormField
          id={IDS.newEmail}
          name="newEmail"
          type="email"
          label={t("changeEmail.label")}
          hint={t("changeEmail.hint")}
          error={errors.newEmail}
          required
          autoComplete="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
        />
        <PasswordField
          key={`password-${passwordKey}`}
          id={IDS.currentPassword}
          name="currentPassword"
          autoComplete="current-password"
          label={t("currentPassword")}
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
          error={errors.currentPassword}
          required
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel={t("changeEmail.pending")}>
          {t("changeEmail.submit")}
        </SubmitButton>
      </form>
    </>
  );
}
