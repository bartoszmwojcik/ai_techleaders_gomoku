import type { ReactNode } from "react";

import { cn } from "./cn";

// Says why nothing is shown and what to do next. Two kinds, written by the caller: "nothing here yet"
// (with a create action) and "no results for these filters" (with a clear-filters action).
type EmptyStateProps = {
  /** Why it is empty, in one short sentence (required). */
  title: ReactNode;
  /** One more sentence if the next step needs explaining. */
  children?: ReactNode;
  /** The next step, usually a Button or a TextLink. */
  action?: ReactNode;
  className?: string;
};

function EmptyState({ title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-start gap-group wrap-anywhere", className)}>
      <p className="m-0 text-body font-strong text-text-primary">{title}</p>
      {children && <p className="m-0 max-w-(--measure-text) text-body text-text-secondary">{children}</p>}
      {action && <div className="mt-group">{action}</div>}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
