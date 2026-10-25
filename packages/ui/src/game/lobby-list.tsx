import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { formatClock } from "./format-clock";

type LobbyListProps = {
  /** Name of the list for screen readers (required), e.g. "Gracze szukający gry". */
  label: string;
  children: ReactNode;
  className?: string;
};

function LobbyList({ label, children, className }: LobbyListProps) {
  return (
    <ul aria-label={label} className={cn("m-0 flex list-none flex-col p-0", className)}>
      {children}
    </ul>
  );
}

type LobbyRowProps = {
  /** Public name of the player looking for a game (required). */
  name: ReactNode;
  /** How long they have been looking, e.g. "szuka od 3 min". */
  since?: ReactNode;
  /** The words before the time, e.g. "wygasa za" (required). */
  expiresLabel: ReactNode;
  /** Time left before their status expires. */
  expiresInMs: number;
  /** Label of the pick button (required), e.g. "Zagraj". */
  selectLabel: string;
  /** Full name of the pick button for screen readers (required), e.g. "Zagraj z Alicja_99". */
  selectAriaLabel: string;
  /** Picking is in progress: the button is busy and cannot be pressed twice. */
  selecting?: boolean;
  onSelect: () => void;
  className?: string;
};

function LobbyRow({
  name,
  since,
  expiresLabel,
  expiresInMs,
  selectLabel,
  selectAriaLabel,
  selecting = false,
  onSelect,
  className,
}: LobbyRowProps) {
  return (
    <li className={cn("flex items-center justify-between gap-stack border-t border-border-default py-3 first:border-t-0", className)}>
      <div className="flex min-w-0 flex-col wrap-anywhere">
        <span className="text-body font-strong text-text-primary">{name}</span>
        {since && <span className="text-meta text-text-muted">{since}</span>}
        <span className="text-meta text-text-secondary">
          {expiresLabel} <span className="tabular-nums">{formatClock(expiresInMs)}</span>
        </span>
      </div>
      <Button variant="secondary" aria-label={selectAriaLabel} loading={selecting} onClick={onSelect}>
        {selectLabel}
      </Button>
    </li>
  );
}

export { LobbyList, LobbyRow };
export type { LobbyListProps, LobbyRowProps };
