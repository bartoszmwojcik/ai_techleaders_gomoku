"use client";

import { displayNameChangeSchema } from "@gomoku/core/validators/auth/profile-change-schema";
import { Alert } from "@gomoku/ui/game/alert";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { apiCall } from "@/lib/api-client";
import { formatValidUntil } from "@/lib/format-date-time";

type Props = {
  displayName: string;
  /** ISO time the next change becomes possible, or `null` when it is possible now. */
  availableAt: string | null;
};

type General = { title: string; details: string };

const HINT = "Nazwę można zmienić raz na dobę. Trwające partie zachowają dotychczasową nazwę.";

function minutes(retryAfterSeconds: number | undefined): string {
  return retryAfterSeconds === undefined ? "za jakiś czas" : `za ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min`;
}

export function ChangeDisplayNameForm({ displayName, availableAt }: Props) {
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
      setError(parsed.error.issues[0]!.message);
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
      setLockedUntil(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      router.refresh();
      return;
    }
    const { code, retryAfterSeconds, fieldErrors } = result.error;
    if (code === "UNAUTHORIZED") {
      router.replace(`/login?next=${encodeURIComponent("/account")}`);
      return;
    }
    const fieldMessage = fieldErrors?.displayName?.[0];
    if (fieldMessage) {
      setError(fieldMessage);
    } else if (code === "DISPLAY_NAME_COOLDOWN") {
      setLockedUntil(new Date(Date.now() + (retryAfterSeconds ?? 0) * 1000).toISOString());
    } else if (code === "RATE_LIMITED") {
      setGeneral({ title: "Zbyt wiele prób", details: `Spróbuj ponownie ${minutes(retryAfterSeconds)}.` });
    } else if (code === "network") {
      setGeneral({ title: "Brak połączenia", details: "Nie udało się połączyć z serwerem. Spróbuj ponownie." });
    } else {
      setGeneral({ title: "Nie udało się zmienić nazwy", details: "Spróbuj ponownie." });
    }
  }

  return (
    <>
      <div aria-live="polite" data-testid="change-name-live">
        {changed && (
          <div data-testid="change-name-success">
            <Alert status="success" role="status" title="Nazwa gracza zmieniona">
              Nowa nazwa będzie widoczna w kolejnych partiach.
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
          label="Nazwa gracza"
          hint={HINT}
          error={error}
          required
          autoComplete="nickname"
          value={value}
          disabled={lockedUntil !== null}
          onChange={(event) => setValue(event.target.value)}
        />
        {lockedUntil !== null && (
          <p className="m-0 text-body text-text-secondary" data-testid="change-name-locked">
            Kolejna zmiana możliwa po {formatValidUntil(lockedUntil)}.
          </p>
        )}
        <SubmitButton pending={pending} pendingLabel="Zmienianie nazwy…" disabled={lockedUntil !== null}>
          Zmień nazwę
        </SubmitButton>
      </form>
    </>
  );
}
