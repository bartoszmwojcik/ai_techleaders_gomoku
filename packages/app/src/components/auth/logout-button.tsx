"use client";

import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { useState } from "react";

import plHeader from "@/i18n/catalogs/pl/header";
import type { NamespaceDict } from "@/i18n/catalogs/types";

import { ErrorMessage } from "@/components/feedback/error-message";

import { useSignOut } from "./use-sign-out";

type LogoutButtonProps = {
  /** From the server (`gameParticipation`): a running game asks for confirmation first (Q4). */
  hasActiveGame?: boolean;
  className?: string;
  /** The `header` namespace from the server; Polish by default. */
  dict?: NamespaceDict<"header">;
};

export function LogoutButton({ hasActiveGame = false, className, dict = plHeader }: LogoutButtonProps) {
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
      {dict.session.logout}
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-stack">
      {failed && (
        <div data-testid="logout-error">
          <ErrorMessage title={dict.logout.failedTitle}>{dict.logout.failedRetry}</ErrorMessage>
        </div>
      )}
      {hasActiveGame ? null : button}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        trigger={hasActiveGame ? button : undefined}
        tone="primary"
        title={dict.logout.title}
        description={dict.logout.gameRunning}
        confirmLabel={dict.logout.confirm}
        cancelLabel={dict.logout.cancel}
        confirming={pending}
        onConfirm={() => void confirmSignOut()}
      />
    </div>
  );
}
