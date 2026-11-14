"use client";

import { registerSchema } from "@gomoku/core/validators/auth/register-schema";
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
import { fieldMessages, localFieldMessages, type ErrorTexts } from "@/lib/api-error-text";
import { fullPageLoad } from "@/lib/full-page-load";

type FieldName = "email" | "displayName" | "password";
type FieldMessages = Partial<Record<FieldName, string>>;
type GeneralError = { title: string; details: ReactNode };

// Fields in the order they appear, so focus goes to the first invalid one.
const FIELD_ORDER: FieldName[] = ["email", "displayName", "password"];
const FIELD_IDS: Record<FieldName, string> = {
  email: "register-email",
  displayName: "register-display-name",
  password: "register-password",
};


type Props = TextsProps<"auth"> & {
  nextPath: string;
  /** The `common` namespace (the limit message); nothing in Polish. */
  commonTexts?: TextsProps<"common">;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

export function RegisterForm({ nextPath, commonTexts = {}, errorTexts = {}, ...texts }: Props) {
  const t = textsOf<"auth">(plAuth, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const loginHref = nextPath === "/" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`;
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  // Remounting the password field hides the password again after every attempt.
  const [passwordKey, setPasswordKey] = useState(0);
  const [errors, setErrors] = useState<FieldMessages>({});
  const [general, setGeneral] = useState<GeneralError | null>(null);
  const [pending, setPending] = useState(false);
  // A fresh object per attempt, so focus moves again even when the same field fails twice.
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  // Callers pass at least one message, so there is always a first invalid field to focus.
  function showFieldErrors(messages: FieldMessages) {
    setErrors(messages);
    const first = FIELD_ORDER.find((field) => messages[field]) as FieldName;
    setFocusTarget({ id: FIELD_IDS[first] });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setGeneral(null);

    // The same schema as the route: invalid input is caught here and costs no attempt of the limit.
    const input = { email, displayName, password };
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      showFieldErrors(localFieldMessages(errorTexts, FIELD_ORDER, parsed.error, "register"));
      return;
    }

    setPending(true);
    const result = await apiCall<{ user: { id: string; displayName: string } }>("/api/auth/register", {
      body: input,
    });
    if (result.ok) {
      // Stay pending while the page navigates, so a second submit is impossible.
      fullPageLoad(nextPath);
      return;
    }

    setPending(false);
    setPassword("");
    setPasswordKey((key) => key + 1);
    const { code, retryAfterSeconds } = result.error;
    const messages: FieldMessages = fieldMessages(errorTexts, FIELD_ORDER, result.error, "register");
    if (Object.keys(messages).length > 0) {
      showFieldErrors(messages);
    } else if (code === "CONFLICT") {
      // Same answer for a taken e-mail, whether or not the name is taken too (no account enumeration).
      setGeneral({
        title: t("register.failed"),
        details: withNodes(t("register.conflict", { link: "{link}" }), {
          link: <TextLink href={loginHref}>{t("register.conflictLink")}</TextLink>,
        }),
      });
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds, common));
    } else if (code === "ALREADY_AUTHENTICATED") {
      setGeneral({
        title: t("shared.alreadySignedIn"),
        details: withNodes(t("register.otherTab", { link: "{link}" }), { link: <TextLink href="/">{t("register.goHome")}</TextLink> }),
      });
    } else if (code === "network") {
      setGeneral({
        title: t("shared.networkTitle"),
        details: t("register.network"),
      });
    } else {
      setGeneral({ title: t("register.failed"), details: t("shared.retry") });
    }
    // The password field was remounted empty; a general error has no field of its own, so focus it.
    if (Object.keys(messages).length === 0) setFocusTarget({ id: FIELD_IDS.password });
  }

  return (
    <>
      {general && (
        <div data-testid="register-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="register-form">
        <FormField
          id={FIELD_IDS.email}
          name="email"
          type="email"
          autoComplete="email"
          label={t("fields.email")}
          hint={t("register.emailHint")}
          error={errors.email}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <FormField
          id={FIELD_IDS.displayName}
          name="displayName"
          autoComplete="nickname"
          label={t("fields.displayName")}
          hint={t("register.nameHint")}
          error={errors.displayName}
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <PasswordField
          key={passwordKey}
          id={FIELD_IDS.password}
          name="password"
          autoComplete="new-password"
          label={t("fields.password")}
          showLabel={t("fields.showPassword")}
          hideLabel={t("fields.hidePassword")}
          hint={t("fields.passwordHint")}
          error={errors.password}
          required
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel={t("register.pending")}>
          {t("register.submit")}
        </SubmitButton>
      </form>
      <p className="m-0 text-body text-text-secondary">
        {t("register.haveAccount")}{" "}
        <TextLink href={loginHref} placement="standalone">
          {t("register.login")}
        </TextLink>
      </p>
    </>
  );
}
