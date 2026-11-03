"use client";

import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { UserMenu, UserMenuAction, UserMenuLink } from "@gomoku/ui/game/user-menu";
import { useRef, useState } from "react";

import { apiCall } from "@/lib/api-client";

import { useSignOut } from "./use-sign-out";

const REASON_TEXT = {
  game: "Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?",
  unknown: "Nie udało się sprawdzić, czy trwa partia. Jeśli trwa, po wylogowaniu zegar biegnie dalej. Wylogować?",
} as const;

/**
 * The menu in the top bar. Its "Wyloguj" asks first during a running game (Q4). The bar sits in the shared layout,
 * which does not render again when a game starts on the page below it, so the game is read when the player chooses
 * "Wyloguj"; a read that fails asks too, because asking costs less than leaving a running game unawares.
 */
export function AccountMenu({ displayName }: { displayName: string }) {
  const { pending, failed, signOut } = useSignOut();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<keyof typeof REASON_TEXT | null>(null);
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
    const lobby = await apiCall<{ currentGame: { status: "waiting" | "active" } | null }>("/api/lobby", { method: "GET" });
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
        label={`Zalogowano jako ${displayName}, menu konta`}
        triggerRef={trigger}
        data-testid="signed-in-as"
      >
        <UserMenuLink href="/account">Konto</UserMenuLink>
        <UserMenuLink href="/history">Historia</UserMenuLink>
        <UserMenuAction onSelect={() => void onLogout()}>Wyloguj</UserMenuAction>
      </UserMenu>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        tone="primary"
        title="Wylogować?"
        description={reason && REASON_TEXT[reason]}
        message={failed && "Nie udało się wylogować. Spróbuj ponownie."}
        confirmLabel="Wyloguj"
        cancelLabel="Zostań zalogowany"
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
