import { CircleX } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

// Replaces content that failed to load: says what happened, what to do, and offers a retry. An error
// that needs action is never a passing message. Announced at once (role=alert).
type ErrorStateProps = {
  /** What happened, in one short sentence (required). */
  title: ReactNode;
  /** What the player can do about it. */
  children?: ReactNode;
  /** The retry or the way out, usually a Button. */
  action?: ReactNode;
  className?: string;
};

function ErrorState({ title, children, action, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn("flex items-start gap-group wrap-anywhere", className)}>
      <span className="flex h-6 items-center">
        <CircleX aria-hidden="true" className="size-(--icon-size-md) shrink-0 text-status-danger" />
      </span>
      <div className="flex min-w-0 flex-col items-start gap-group">
        <p className="m-0 text-body font-strong text-status-danger">{title}</p>
        {children && <p className="m-0 max-w-(--measure-text) text-body text-text-secondary">{children}</p>}
        {action && <div className="mt-group">{action}</div>}
      </div>
    </div>
  );
}

export { ErrorState };
export type { ErrorStateProps };
