import type { ReactNode } from "react";

import { Alert } from "./alert";
import { Button } from "./button";
import { formatClock } from "./format-clock";

type SeekingStatusProps = {
  /** "Szukasz gry" (required). */
  title: ReactNode;
  /** The words before the time, e.g. "Status wygasa za" (required). */
  expiresLabel: ReactNode;
  /** Time left before the status expires (BR-12, 5 minutes). The server owns the time. */
  expiresInMs: number;
  /** Label of the withdraw button (required), e.g. "Wycofaj". */
  withdrawLabel: string;
  onWithdraw: () => void;
  className?: string;
};

// The player's own "looking for a game" status. The time left is always visible (A05: waiting is never hidden).
function SeekingStatus({ title, expiresLabel, expiresInMs, withdrawLabel, onWithdraw, className }: SeekingStatusProps) {
  return (
    <Alert status="info" title={title} className={className}>
      <p className="m-0">
        {expiresLabel} <strong className="tabular-nums">{formatClock(expiresInMs)}</strong>
      </p>
      <div className="mt-group">
        <Button variant="secondary" onClick={onWithdraw}>
          {withdrawLabel}
        </Button>
      </div>
    </Alert>
  );
}

export { SeekingStatus };
export type { SeekingStatusProps };
