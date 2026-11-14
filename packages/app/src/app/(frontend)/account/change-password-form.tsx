"use client";

import { passwordChangeSchema } from "@gomoku/core/validators/auth/password-change-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { useEffect, useState, type FormEvent } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import plAccount from "@/i18n/catalogs/pl/account";
import plCommon from "@/i18n/catalogs/pl/common";
import { textsOf, type TextsProps } from "@/i18n/client";
import { apiCall } from "@/lib/api-client";
import { fieldMessages, localFieldMessages, type ErrorTexts } from "@/lib/api-error-text";
import { fullPageLoad } from "@/lib/full-page-load";

type FieldName = "currentPassword" | "newPassword";
type FieldMessages = Partial<Record<FieldName, string>>;
type GeneralError = { title: string; details: string };

const FIELD_ORDER: FieldName[] = ["currentPassword", "newPassword"];
const FIELD_IDS: Record<FieldName, string> = {
  currentPassword: "change-current-password",
  newPassword: "change-new-password",
};



type Props = {
  /** The `account` and `common` namespaces; nothing in Polish. */
  texts?: TextsProps<"account">;
  commonTexts?: TextsProps<"common">;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

export function ChangePasswordForm({ texts = {}, commonTexts = {}, errorTexts = {} }: Props = {}) {
  const t = textsOf<"account">(plAccount, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // Remounting a password field hides the password again.
  const [currentKey, setCurrentKey] = useState(0);
  const [newKey, setNewKey] = useState(0);
  const [errors, setErrors] = useState<FieldMessages>({});
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, setPending] = useState(false);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  function showFieldErrors(messages: FieldMessages) {
    setErrors(messages);
    // Callers pass at least one message, so there is always a first invalid field.
    setFocusTarget({ id: FIELD_IDS[FIELD_ORDER.find((field) => messages[field]) as FieldName] });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneral(null);
    setChanged(false);

    // Same schema as the route: a malformed form costs no attempt of the limit.
    const input = { currentPassword, newPassword };
    const parsed = passwordChangeSchema.safeParse(input);
    if (!parsed.success) {
      showFieldErrors(localFieldMessages(errorTexts, FIELD_ORDER, parsed.error, "changePassword"));
      return;
    }

    setPending(true);
    const result = await apiCall<null>("/api/auth/password", { body: input });
    setPending(false);

    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setCurrentKey((key) => key + 1);
      setNewKey((key) => key + 1);
      setChanged(true);
      return;
    }

    const { code, retryAfterSeconds } = result.error;
    if (code === "UNAUTHORIZED") {
      // The session expired while the form was open: sign in again and come back here.
      fullPageLoad(`/login?next=${encodeURIComponent("/account")}`);
      return;
    }
    const messages: FieldMessages = fieldMessages(errorTexts, FIELD_ORDER, result.error, "changePassword");
    if (code === "INVALID_CURRENT_PASSWORD") {
      // Only the wrong password is cleared (and hidden again); the new one stays.
      setCurrentPassword("");
      setCurrentKey((key) => key + 1);
    }
    if (Object.keys(messages).length > 0) {
      showFieldErrors(messages);
      return;
    }
    if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds, common));
    } else if (code === "network") {
      setGeneral({
        title: t("networkTitle"),
        details: t("networkKept"),
      });
    } else {
      setGeneral({ title: t("changePassword.failed"), details: t("retry") });
    }
    // The error has no field of its own: focus the current password.
    setFocusTarget({ id: FIELD_IDS.currentPassword });
  }

  return (
    <>
      {/* Mounted from the start, so assistive technology announces the content added later. */}
      <div aria-live="polite" data-testid="change-password-live">
        {changed && (
          <div data-testid="change-password-success">
            <Alert status="success" role="status" title={t("changePassword.doneTitle")}>
              {t("changePassword.doneBody")}
            </Alert>
          </div>
        )}
      </div>
      {general && (
        <div data-testid="change-password-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="change-password-form">
        <PasswordField
          key={`current-${currentKey}`}
          id={FIELD_IDS.currentPassword}
          name="currentPassword"
          autoComplete="current-password"
          label={t("currentPassword")}
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
          error={errors.currentPassword}
          required
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <PasswordField
          key={`new-${newKey}`}
          id={FIELD_IDS.newPassword}
          name="newPassword"
          autoComplete="new-password"
          label={t("newPassword")}
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
          hint={t("passwordHint")}
          error={errors.newPassword}
          required
          value={newPassword}
          onChange={setNewPassword}
        />
        {/* Static text, not a message: no role, so it is not announced as a live region. */}
        <Alert status="warning" role="none" title={t("changePassword.warningTitle")}>
          {t("changePassword.warningBody")}
        </Alert>
        <SubmitButton pending={pending} pendingLabel={t("changePassword.pending")}>
          {t("changePassword.submit")}
        </SubmitButton>
      </form>
    </>
  );
}
