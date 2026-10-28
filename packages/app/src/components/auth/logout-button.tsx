"use client";

import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorMessage } from "@/components/feedback/error-message";
import { apiCall } from "@/lib/api-client";

type LogoutButtonProps = {
  /** From the server (`activeGameCheck`): a running game asks for confirmation first (Q4). */
  hasActiveGame?: boolean;
  className?: string;
};

export function LogoutButton({ hasActiveGame = false, className }: LogoutButtonProps) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const result = await apiCall("/api/auth/logout");
    if (result.ok) {
      // Stay pending while the page navigates, so a second click is impossible.
      router.replace("/");
      return;
    }
    setPending(false);
    setAsking(false);
    setFailed(true);
  }

  return (
    <div className="flex flex-col items-start gap-stack">
      {failed && (
        <div data-testid="logout-error">
          <ErrorMessage title="Nie udało się wylogować">Spróbuj ponownie.</ErrorMessage>
        </div>
      )}
      <Button
        variant="secondary"
        className={className}
        loading={pending && !asking}
        onClick={() => (hasActiveGame ? setAsking(true) : void signOut())}
      >
        Wyloguj
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        tone="primary"
        title="Wylogować?"
        description="Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?"
        confirmLabel="Wyloguj"
        cancelLabel="Zostań zalogowany"
        confirming={pending}
        onConfirm={() => void signOut()}
      />
    </div>
  );
}
