"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { useRef, useState } from "react";

import { apiCall } from "@/lib/api-client";
import type { ShowTranslator } from "@/lib/show/texts";
import type { ShowView } from "@/server/http/show-view";

type Props = {
  gameId: string;
  t: ShowTranslator;
  /** The show's state after the end (`cancelled`), or `null` when it had finished in the meantime (409). */
  onEnded: (state: ShowView | null) => void;
};

/** "Zakończ pokaz" (P7): irreversible, so a confirmation dialog first; a failure is an alert next to it. */
export function EndShowButton({ gameId, t, onEnded }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set synchronously: a double click cannot send the request twice (lesson 2026-10-29).
  const inFlight = useRef(false);

  async function end() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    const result = await apiCall<ShowView>(`/api/show/${gameId}/end`);
    inFlight.current = false;
    setPending(false);
    setOpen(false);
    if (result.ok) onEnded(result.data);
    else if (result.error.code === "GAME_NOT_ACTIVE") onEnded(null);
    else setFailed(true);
  }

  return (
    <div className="flex flex-col items-start gap-group">
      {failed && <Alert status="danger" role="alert" title={t("end.failed")} />}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Button variant="danger" data-testid="show-end">
            {t("end.action")}
          </Button>
        }
        tone="danger"
        title={t("end.title")}
        description={t("end.body")}
        confirmLabel={t("end.confirm")}
        cancelLabel={t("end.cancel")}
        confirming={pending}
        onConfirm={() => void end()}
      />
    </div>
  );
}
