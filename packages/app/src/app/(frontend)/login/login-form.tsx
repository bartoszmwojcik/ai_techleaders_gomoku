"use client";

import { loginSchema } from "@gomoku/core/validators/auth/login-schema";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import plAuth from "@/i18n/catalogs/pl/auth";
import plCommon from "@/i18n/catalogs/pl/common";
import { textsOf, type TextsProps } from "@/i18n/client";
import { withNodes } from "@/i18n/rich";
import { apiCall } from "@/lib/api-client";
import { localFieldMessages, type ErrorTexts } from "@/lib/api-error-text";
import { fullPageLoad } from "@/lib/full-page-load";

type FieldName = "email" | "password";
type FieldMessages = Partial<Record<FieldName, string>>;
type GeneralError = { title: string; details: ReactNode };

const FIELD_ORDER: FieldName[] = ["email", "password"];
const FIELD_IDS: Record<FieldName, string> = { email: "login-email", password: "login-password" };


type Props = TextsProps<"auth"> & {
  nextPath: string;
  /** The `common` namespace (the limit message); nothing in Polish. */
  commonTexts?: TextsProps<"common">;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

export function LoginForm({ nextPath, commonTexts = {}, errorTexts = {}, ...texts }: Props) {
  const t = textsOf<"auth">(plAuth, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Remounting the password field hides the password again after a wrong one.
  const [passwordKey, setPasswordKey] = useState(0);
  const [errors, setErrors] = useState<FieldMessages>({});
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [pending, setPending] = useState(false);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneral(null);

    // Same schema as the route: a malformed form costs no attempt of the limit.
    const input = { email, password };
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      const messages: FieldMessages = localFieldMessages(errorTexts, FIELD_ORDER, parsed.error, "login");
      setErrors(messages);
      // The schema reports at least one field, so there is always a first invalid one.
      setFocusTarget({ id: FIELD_IDS[FIELD_ORDER.find((field) => messages[field]) as FieldName] });
      return;
    }

    setPending(true);
    const result = await apiCall<{ user: { id: string; displayName: string } }>("/api/auth/login", {
      body: input,
    });
    if (result.ok) {
      // Stay pending while the page navigates, so a second submit is impossible.
      fullPageLoad(nextPath);
      return;
    }

    setPending(false);
    const { code, retryAfterSeconds } = result.error;
    if (code === "INVALID_CREDENTIALS") {
      // Only a wrong password is cleared (and hidden again); other failures keep what was typed.
      setPassword("");
      setPasswordKey((key) => key + 1);
      // One message for an unknown e-mail and a wrong password: no field is blamed.
      setGeneral({ title: t("login.invalidTitle"), details: t("login.invalidBody") });
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds, common));
    } else if (code === "ALREADY_AUTHENTICATED") {
      setGeneral({
        title: t("shared.alreadySignedIn"),
        details: withNodes(t("login.otherTab", { link: "{link}" }), { link: <TextLink href={nextPath}>{t("login.goOn")}</TextLink> }),
      });
    } else if (code === "network") {
      setGeneral({
        title: t("shared.networkTitle"),
        details: t("login.network"),
      });
    } else {
      setGeneral({ title: t("login.failed"), details: t("shared.retry") });
    }
    // The error has no field of its own: focus the password (empty after a wrong one).
    setFocusTarget({ id: FIELD_IDS.password });
  }

  const registerHref = nextPath === "/" ? "/register" : `/register?next=${encodeURIComponent(nextPath)}`;

  return (
    <>
      {general && (
        <div data-testid="login-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="login-form">
        <FormField
          id={FIELD_IDS.email}
          name="email"
          type="email"
          autoComplete="email"
          label={t("fields.email")}
          error={errors.email}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordField
          key={passwordKey}
          id={FIELD_IDS.password}
          name="password"
          autoComplete="current-password"
          label={t("fields.password")}
          showLabel={t("fields.showPassword")}
          hideLabel={t("fields.hidePassword")}
          error={errors.password}
          required
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel={t("login.pending")}>
          {t("login.submit")}
        </SubmitButton>
      </form>
      <p className="m-0 text-body text-text-secondary">
        <TextLink href="/forgot-password" placement="standalone">
          {t("login.forgot")}
        </TextLink>
      </p>
      <p className="m-0 text-body text-text-secondary">
        {t("login.noAccount")}{" "}
        <TextLink href={registerHref} placement="standalone">
          {t("login.register")}
        </TextLink>
      </p>
    </>
  );
}
