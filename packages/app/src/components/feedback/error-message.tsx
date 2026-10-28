import { Alert } from "@gomoku/ui/game/alert";
import type { ReactNode } from "react";

type ErrorMessageProps = {
  /** What went wrong, in a few words (passed in). Renders nothing when empty. */
  title?: ReactNode;
  /** What to do next. */
  children?: ReactNode;
  className?: string;
};

/** Form-level error (server error, rate limit): an announced `role="alert"`, never a toast. */
export function ErrorMessage({ title, children, className }: ErrorMessageProps) {
  if (!title) return null;
  return (
    <Alert status="danger" title={title} className={className}>
      {children}
    </Alert>
  );
}
