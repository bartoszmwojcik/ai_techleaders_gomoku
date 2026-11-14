"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Checkbox } from "@gomoku/ui/game/checkbox";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { Panel } from "@gomoku/ui/game/panel";
import { PasswordField } from "@gomoku/ui/game/password-field";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRef, useState } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import plAccount from "@/i18n/catalogs/pl/account";
import plCommon from "@/i18n/catalogs/pl/common";
import { textsOf, type TextsProps } from "@/i18n/client";
import { apiCall } from "@/lib/api-client";
import { fieldMessages, type ErrorTexts } from "@/lib/api-error-text";
import { fullPageLoad } from "@/lib/full-page-load";

type DeleteAccountFormProps = {
  displayName: string;
  /** The game the account holds (waiting or in progress), read on the server. */
  currentGame: { gameId: string; status: "waiting" | "active" } | null;
  /** The `account` and `common` namespaces; nothing in Polish. */
  texts?: TextsProps<"account">;
  commonTexts?: TextsProps<"common">;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

type Phase = "idle" | "asking" | "deleting";
type General = { title: string; text: string };

const PASSWORD_ID = "delete-account-password";

// Radix returns focus to the trigger when the dialog closes; the field or the message must win.
const focusLater = (focus: () => void) => setTimeout(focus, 80);

/**
 * "Usuń konto" on /account (E01-S06, #37; prototype `konta-i-role`, states s05.10–s05.20): the
 * password sits in the panel, the dialog only asks. The deletion is final, so a success reloads
 * the whole page on `/?notice=account-deleted` (the layout reads the session).
 */
export function DeleteAccountForm({ displayName, currentGame, texts = {}, commonTexts = {}, errorTexts = {} }: DeleteAccountFormProps) {
  const t = textsOf<"account">(plAccount, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const [password, setPassword] = useState("");
  // Remounting a password field hides the password again.
  const [passwordKey, setPasswordKey] = useState(0);
  const [checked, setChecked] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [general, setGeneral] = useState<General | null>(null);
  const [dialogError, setDialogError] = useState(false);
  // The game in progress, from the server or from a `409` (it started meanwhile).
  const [activeGameId, setActiveGameId] = useState(currentGame?.status === "active" ? currentGame.gameId : null);
  // A ref, not state: it must block a second send in the same tick, before the button is busy.
  const sending = useRef(false);
  const blockRef = useRef<HTMLDivElement>(null);

  const reason = activeGameId
    ? t("delete.activeReason")
    : !checked
      ? t("delete.confirmReason")
      : null;

  const focusPassword = () => focusLater(() => document.getElementById(PASSWORD_ID)?.focus());

  function ask() {
    setGeneral(null);
    setDialogError(false);
    if (!password) {
      setFieldError(t("delete.enterPassword"));
      focusPassword();
      return;
    }
    setFieldError(undefined);
    setPhase("asking");
  }

  async function confirm() {
    if (sending.current) return;
    sending.current = true;
    setPhase("deleting");
    setDialogError(false);
    const result = await apiCall<null>("/api/account/delete", { body: { password, confirm: true } });
    sending.current = false;

    if (result.ok) {
      // A full page load, not a client navigation: the layout reads the (now gone) session. An
      // absolute URL, because the session is meant to end the SPA state, not to be routed.
      fullPageLoad("/?notice=account-deleted");
      return;
    }
    const { code, data, retryAfterSeconds } = result.error;
    if (code === "UNAUTHORIZED") {
      // The session is gone (or the account already): sign in again and come back here.
      fullPageLoad(`/login?next=${encodeURIComponent("/account")}`);
      return;
    }
    if (code === "INVALID_PASSWORD") {
      setPhase("idle");
      setPassword("");
      setPasswordKey((key) => key + 1);
      setFieldError(fieldMessages(errorTexts, ["password"], result.error, "deleteAccount").password ?? t("delete.wrongPassword"));
      focusPassword();
      return;
    }
    if (code === "RATE_LIMITED") {
      setPhase("idle");
      const limited = rateLimitedError(retryAfterSeconds, common);
      setGeneral({ title: limited.title, text: limited.details });
      return;
    }
    if (code === "ACTIVE_GAME" && typeof data?.gameId === "string") {
      setPhase("idle");
      setFieldError(undefined);
      setActiveGameId(data.gameId);
      focusLater(() => blockRef.current?.focus());
      return;
    }
    // A server or network failure: nothing was changed, the dialog stays open for a retry.
    setPhase("asking");
    setDialogError(true);
  }

  return (
    <Panel title={t("delete.title")} className="border-status-danger" data-testid="delete-account-panel">
      <Alert status="warning" role="none" title={t("delete.warningTitle")}>
        <p className="m-0">{t("delete.warningBody")}</p>
        {currentGame?.status === "waiting" && (
          <p className="m-0 mt-group" data-testid="delete-account-waiting">
            {t("delete.waiting")}
          </p>
        )}
      </Alert>
      {activeGameId && (
        <div ref={blockRef} tabIndex={-1} className="focus-visible:focus-ring" data-testid="delete-account-active-game">
          <Alert status="warning" title={t("delete.activeTitle")}>
            {t("delete.activeBody")}{" "}
            <TextLink href={`/games/${activeGameId}`}>{t("delete.goToGame")}</TextLink>
          </Alert>
        </div>
      )}
      {general && (
        <div data-testid="delete-account-error">
          <ErrorMessage title={general.title}>{general.text}</ErrorMessage>
        </div>
      )}
      <PasswordField
        key={passwordKey}
        id={PASSWORD_ID}
        name="password"
        label={t("password")}
        showLabel={t("showPassword")}
        hideLabel={t("hidePassword")}
        hint={t("delete.passwordHint")}
        error={fieldError}
        autoComplete="current-password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          setFieldError(undefined);
        }}
        className="max-w-sm"
      />
      <Checkbox
        label={t("delete.understand")}
        checked={checked}
        onCheckedChange={(value) => setChecked(value === true)}
        data-testid="delete-account-confirm"
      />
      <div className="flex flex-col items-start gap-group">
        <ConfirmDialog
          open={phase !== "idle"}
          onOpenChange={(open) => {
            // The button is the trigger, so focus returns to it on close. Esc and the way out are
            // blocked while the server works.
            if (open) ask();
            else if (phase !== "deleting") setPhase("idle");
          }}
          trigger={
            <Button
              variant="danger"
              disabled={reason !== null}
              aria-describedby={reason ? "delete-account-reason" : undefined}
              data-testid="delete-account-submit"
            >
              {t("delete.submit")}
            </Button>
          }
          title={t("delete.dialogTitle", { name: displayName })}
          description={
            <>
              {t("delete.dialogBody")}
              {currentGame?.status === "waiting" ? ` ${t("delete.waiting")}` : ""}
            </>
          }
          message={dialogError ? t("delete.serverError") : undefined}
          confirmLabel={t("delete.submit")}
          cancelLabel={t("delete.keep")}
          confirming={phase === "deleting"}
          onConfirm={() => void confirm()}
        />
        {reason && (
          <p id="delete-account-reason" className="m-0 text-meta text-text-muted">
            {reason}
          </p>
        )}
      </div>
    </Panel>
  );
}
