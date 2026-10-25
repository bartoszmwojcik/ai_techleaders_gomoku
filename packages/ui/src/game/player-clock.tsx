import type { ReactNode } from "react";

import { cn } from "./cn";
import { clockDuration, formatClock } from "./format-clock";
import { StatusBadge } from "./status-badge";

type PlayerClockProps = {
  /** Name of the player (required). */
  name: ReactNode;
  /** Time left in milliseconds. The server owns the time; this only shows what it is given. */
  remainingMs: number;
  /** This player's clock is running. */
  active?: boolean;
  /** The word shown while the clock runs, e.g. "Twój ruch". The active clock is never marked by colour alone. */
  activeLabel?: ReactNode;
  /** The word shown when little time is left, e.g. "Mało czasu". */
  lowLabel?: ReactNode;
  /** Below this the low-time label appears. */
  lowThresholdMs?: number;
  className?: string;
};

// A chess clock: big tabular digits, no animation (the digits change once a second). The running clock
// has a strong outline and a word; low time adds a warning with an icon.
function PlayerClock({
  name,
  remainingMs,
  active = false,
  activeLabel,
  lowLabel,
  lowThresholdMs = 60_000,
  className,
}: PlayerClockProps) {
  const low = remainingMs < lowThresholdMs;

  return (
    <div
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex flex-wrap items-center justify-between gap-group rounded-base border bg-surface-raised p-4 wrap-anywhere",
        active ? "border-text-primary" : "border-border-default",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-meta font-strong text-text-secondary">{name}</span>
        {active && activeLabel && <span className="text-meta text-text-primary">{activeLabel}</span>}
      </div>
      <div className="flex items-center gap-group">
        {low && lowLabel && <StatusBadge status="warning">{lowLabel}</StatusBadge>}
        <time
          role="timer"
          dateTime={clockDuration(remainingMs)}
          className="text-section font-strong text-text-primary tabular-nums"
        >
          {formatClock(remainingMs)}
        </time>
      </div>
    </div>
  );
}

export { PlayerClock };
export type { PlayerClockProps };
