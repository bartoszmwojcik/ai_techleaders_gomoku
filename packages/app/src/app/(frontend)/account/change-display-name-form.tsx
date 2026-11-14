"use client";

import { displayNameChangeSchema } from "@gomoku/core/validators/auth/profile-change-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

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
import { formatValidUntil } from "@/lib/format-date-time";

type Props = {
  displayName: string;
  /** ISO time the next change becomes possible, or `null` when it is possible now. */
  availableAt: string | null;
  /** The `account` and `common` namespaces; nothing in Polish. */
  texts?: TextsProps<"account">;
  commonTexts?: TextsProps<"common">;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

type General = { title: string; details: string };

/** The moment `ms` from now, as the server would write it (read in a handler, never during render). */
const isoAfter = (ms: number) => new Date(Date.now() + ms).toISOString();

export function ChangeDisplayNameForm({ displayName, availableAt, texts = {}, commonTexts = {}, errorTexts = {} }: Props) {
  const t = textsOf<"account">(plAccount, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const router = useRouter();
  const [value, setValue] = useState(displayName);
  const [error, setError] = useState<string | undefined>();
  const [general, setGeneral] = useState<General | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, setPending] = useState(false);
  // Set by a successful change or a 429 of the window, until the page is refreshed.
  const [lockedUntil, setLockedUntil] = useState<string | null>(availableAt);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setGeneral(null);
    setChanged(false);

    const parsed = displayNameChangeSchema.safeParse({ displayName: value });
    if (!parsed.success) {
      setError(localFieldMessages(errorTexts, ["displayName"], parsed.error, "changeDisplayName").displayName);
      return;
    }
    setPending(true);
    const result = await apiCall<{ displayName: string }>("/api/auth/display-name", {
      method: "PATCH",
      body: parsed.data,
    });
    setPending(false);

    if (result.ok) {
      setValue(result.data.displayName);
      setChanged(true);
      setLockedUntil(isoAfter(24 * 60 * 60 * 1000));
      router.refresh();
      return;
    }
    const { code, retryAfterSeconds } = result.error;
    if (code === "UNAUTHORIZED") {
      fullPageLoad(`/login?next=${encodeURIComponent("/account")}`);
      return;
    }
    const fieldMessage = fieldMessages(errorTexts, ["displayName"], result.error, "changeDisplayName").displayName;
    if (fieldMessage) {
      setError(fieldMessage);
    } else if (code === "DISPLAY_NAME_COOLDOWN") {
      setLockedUntil(isoAfter((retryAfterSeconds ?? 0) * 1000));
    } else if (code === "RATE_LIMITED") {
      setGeneral(rateLimitedError(retryAfterSeconds, common));
    } else if (code === "network") {
      setGeneral({ title: t("networkTitle"), details: t("network") });
    } else {
      setGeneral({ title: t("changeName.failed"), details: t("retry") });
    }
  }

  return (
    <>
      <div aria-live="polite" data-testid="change-name-live">
        {changed && (
          <div data-testid="change-name-success">
            <Alert status="success" role="status" title={t("changeName.doneTitle")}>
              {t("changeName.doneBody")}
            </Alert>
          </div>
        )}
      </div>
      {general && (
        <div data-testid="change-name-error">
          <ErrorMessage title={general.title}>{general.details}</ErrorMessage>
        </div>
      )}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-stack" data-testid="change-name-form">
        <FormField
          name="displayName"
          label={t("changeName.label")}
          hint={t("changeName.hint")}
          error={error}
          required
          autoComplete="nickname"
          value={value}
          disabled={lockedUntil !== null}
          onChange={(event) => setValue(event.target.value)}
        />
        {lockedUntil !== null && (
          <p className="m-0 text-body text-text-secondary" data-testid="change-name-locked">
            {t("changeName.locked", { date: formatValidUntil(lockedUntil, t.locale) })}
          </p>
        )}
        <SubmitButton pending={pending} pendingLabel={t("changeName.pending")} disabled={lockedUntil !== null}>
          {t("changeName.submit")}
        </SubmitButton>
      </form>
    </>
  );
}
