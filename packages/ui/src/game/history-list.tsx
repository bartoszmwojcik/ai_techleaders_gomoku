import type { ReactNode } from "react";

import { cn } from "./cn";
import type { GameResult } from "./game-result-banner";
import { StatusBadge } from "./status-badge";

type HistoryListProps = {
  /** Name of the list for screen readers (required), e.g. "Zakończone partie". */
  label: string;
  children: ReactNode;
  className?: string;
};

function HistoryList({ label, children, className }: HistoryListProps) {
  return (
    <ul aria-label={label} className={cn("m-0 flex list-none flex-col p-0", className)}>
      {children}
    </ul>
  );
}

const STATUS_BY_RESULT = { win: "success", loss: "danger", draw: "info" } as const;

type HistoryRowProps = {
  /** The opponent: a name, "Usunięty gracz" (BR-17) or "Zaproszony przez link" (BR-24) (required). */
  opponent: ReactNode;
  result: GameResult;
  /** The result in a word, e.g. "Wygrana" (required). */
  resultLabel: ReactNode;
  /** The date of the game (required). */
  date: ReactNode;
  /** How it ended, e.g. "5 w linii", "Koniec czasu", "Plansza pełna". */
  reason?: ReactNode;
  className?: string;
};

function HistoryRow({ opponent, result, resultLabel, date, reason, className }: HistoryRowProps) {
  return (
    <li className={cn("flex flex-wrap items-center justify-between gap-stack border-t border-border-default py-3 first:border-t-0", className)}>
      <div className="flex min-w-0 flex-col wrap-anywhere">
        <span className="text-body font-strong text-text-primary">{opponent}</span>
        <span className="text-meta text-text-muted">
          {date}
          {reason && <> · {reason}</>}
        </span>
      </div>
      <StatusBadge status={STATUS_BY_RESULT[result]}>{resultLabel}</StatusBadge>
    </li>
  );
}

export { HistoryList, HistoryRow };
export type { HistoryListProps, HistoryRowProps };
