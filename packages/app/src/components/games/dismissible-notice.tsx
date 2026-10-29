"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { useState, type ReactNode } from "react";

type DismissibleNoticeProps = {
  title: ReactNode;
  children?: ReactNode;
  closeLabel: string;
};

/** An informational message the player can close (it says what happened on the previous page). */
export function DismissibleNotice({ title, children, closeLabel }: DismissibleNoticeProps) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Alert status="info" title={title} role="status">
      {children}
      <div className="mt-group">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {closeLabel}
        </Button>
      </div>
    </Alert>
  );
}
