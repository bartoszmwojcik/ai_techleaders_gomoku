"use client";

import type { Locale } from "@gomoku/core/i18n/locales";
import { createTranslator } from "@gomoku/core/i18n/translator";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { UserMenu, UserMenuAction, UserMenuLink } from "@gomoku/ui/game/user-menu";
import { useRef, useState } from "react";

import plHeader from "@/i18n/catalogs/pl/header";
import type { NamespaceDict } from "@/i18n/catalogs/types";
import { apiCall } from "@/lib/api-client";

import { useSignOut } from "./use-sign-out";

const REASON_KEY = { game: "logout.gameRunning", unknown: "logout.gameUnknown" } as const;

/** A read that hangs must not leave "Wyloguj" dead; after this long it counts as failed, and the menu asks. */
const LOBBY_READ_TIMEOUT_MS = 5_000;

/**
 * The menu in the top bar. Its "Wyloguj" asks first during a running game (Q4). The bar sits in the shared layout,
 * which does not render again when a game starts on the page below it, so the game is read when the player chooses
 * "Wyloguj"; a read that fails asks too, because asking costs less than leaving a running game unawares.
 */
export function AccountMenu({
  displayName,
  locale = "pl",
  dict = plHeader,
}: {
  displayName: string;
  /** Language and `header` namespace from the server; Polish by default. */
  locale?: Locale;
  dict?: NamespaceDict<"header">;
}) {
  const t = createTranslator(locale, dict);
  const { pending, failed, signOut, clearFailed } = useSignOut();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<keyof typeof REASON_KEY | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // State alone lags a double activation by one render, and the read below takes a while.
  const inFlight = useRef(false);

  async function attempt() {
    // A failure is shown in the dialog: the bar has no room for it and it works on every page.
    if (!(await signOut())) {
      inFlight.current = false;
      setAsking(true);
    }
  }

  async function onLogout() {
    if (inFlight.current) return;
    inFlight.current = true;
    clearFailed();
    const lobby = await apiCall<{ currentGame: { status: "waiting" | "active" } | null }>("/api/lobby", {
      method: "GET",
      signal: AbortSignal.timeout(LOBBY_READ_TIMEOUT_MS),
    });
    const unknown = !lobby.ok && lobby.error.code !== "UNAUTHORIZED";
    const nextReason = unknown ? "unknown" : lobby.ok && lobby.data.currentGame?.status === "active" ? "game" : null;
    setReason(nextReason);
    if (nextReason) {
      inFlight.current = false;
      setAsking(true);
      return;
    }
    await attempt();
  }

  return (
    <>
      <UserMenu
        name={displayName}
        label={t("session.menuLabel", { name: displayName })}
        triggerRef={trigger}
        data-testid="signed-in-as"
      >
        <UserMenuLink href="/account">{t("session.account")}</UserMenuLink>
        <UserMenuLink href="/history">{t("session.history")}</UserMenuLink>
        <UserMenuAction onSelect={() => void onLogout()}>{t("session.logout")}</UserMenuAction>
      </UserMenu>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        tone="primary"
        title={t("logout.title")}
        description={reason && t(REASON_KEY[reason])}
        message={failed && t("logout.failed")}
        confirmLabel={t("logout.confirm")}
        cancelLabel={t("logout.cancel")}
        confirming={pending}
        onConfirm={() => void attempt()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      />
    </>
  );
}
