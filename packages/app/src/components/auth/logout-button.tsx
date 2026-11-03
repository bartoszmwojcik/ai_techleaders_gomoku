"use client";

import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { useState } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";

import { useSignOut } from "./use-sign-out";

type LogoutButtonProps = {
  /** From the server (`gameParticipation`): a running game asks for confirmation first (Q4). */
  hasActiveGame?: boolean;
  className?: string;
};

export function LogoutButton({ hasActiveGame = false, className }: LogoutButtonProps) {
  const { pending, failed, signOut } = useSignOut();
  const [asking, setAsking] = useState(false);

  async function confirmSignOut() {
    if (!(await signOut())) setAsking(false);
  }

  // With a running game the button is the dialog's trigger, so Radix returns focus to it on close.
  const button = (
    <Button
      variant="secondary"
      className={className}
      loading={pending && !asking}
      onClick={hasActiveGame ? undefined : () => void signOut()}
    >
      Wyloguj
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-stack">
      {failed && (
        <div data-testid="logout-error">
          <ErrorMessage title="Nie udało się wylogować">Spróbuj ponownie.</ErrorMessage>
        </div>
      )}
      {hasActiveGame ? null : button}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        trigger={hasActiveGame ? button : undefined}
        tone="primary"
        title="Wylogować?"
        description="Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?"
        confirmLabel="Wyloguj"
        cancelLabel="Zostań zalogowany"
        confirming={pending}
        onConfirm={() => void confirmSignOut()}
      />
    </div>
  );
}
