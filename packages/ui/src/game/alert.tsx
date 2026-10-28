import type { ReactNode } from "react";

import { cn } from "./cn";
import { STATUS, type Status } from "./status";

// Every status has an icon and a word (title), so colour is never the only carrier (WCAG 1.4.1).
type AlertProps = {
  status?: Status;
  /** The word that names the status and the point of the message (required). */
  title: ReactNode;
  /** Details and what to do next. */
  children?: ReactNode;
  className?: string;
  /**
   * Overrides the role derived from the status (e.g. a lost game is announced politely, as a status).
   * `"none"` renders no role: for static text that is not a message to announce.
   */
  role?: "status" | "alert" | "none";
};

function Alert({ status = "info", title, children, className, role }: AlertProps) {
  const { Icon, role: defaultRole, text, border } = STATUS[status];

  return (
    <div role={role === "none" ? undefined : (role ?? defaultRole)} className={cn("flex items-start gap-group rounded-base border bg-surface-raised p-4 wrap-anywhere", border, className)}>
      <span className="flex h-6 items-center">
        <Icon aria-hidden="true" className={cn("size-(--icon-size-md) shrink-0", text)} />
      </span>
      <div className="flex min-w-0 flex-col gap-group">
        <p className={cn("m-0 text-body font-strong", text)}>{title}</p>
        {children && <div className="text-body text-text-secondary">{children}</div>}
      </div>
    </div>
  );
}

export { Alert };
export type { AlertProps };
