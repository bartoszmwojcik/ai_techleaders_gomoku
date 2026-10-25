import type { ReactNode } from "react";

import { cn } from "./cn";
import { STATUS, type Status } from "./status";

// A small status label: icon, word and border in the status colour. Square corners, no pills (A02).
type StatusBadgeProps = {
  status?: Status;
  /** The word that names the status (required): "Wygrana", "Czeka na przeciwnika". */
  children: ReactNode;
  className?: string;
};

function StatusBadge({ status = "info", children, className }: StatusBadgeProps) {
  const { Icon, text, border } = STATUS[status];

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-group wrap-anywhere rounded-base border bg-surface-page px-2 py-1 text-meta font-strong",
        border,
        text,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-(--icon-size-sm) shrink-0" />
      {children}
    </span>
  );
}

export { StatusBadge };
export type { StatusBadgeProps };
