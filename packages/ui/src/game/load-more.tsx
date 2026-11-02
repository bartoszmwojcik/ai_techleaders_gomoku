import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Alert } from "./alert";
import { Button } from "./button";
import { cn } from "./cn";

// "Show more" under a paged list. Four states: idle (the button), loading (the button stays in the
// tab order, busy, clicks ignored: a disabled button would drop the keyboard focus), error (an
// alert with a retry button) and done (no button, a closing note). No text is built in.
type LoadMoreStatus = "idle" | "loading" | "error" | "done";

type LoadMoreProps = {
  status: LoadMoreStatus;
  onLoadMore: () => void;
  /** The button in the idle and loading states: "Pokaż starsze". */
  label: ReactNode;
  /** The button in the error state: "Spróbuj ponownie". */
  retryLabel: ReactNode;
  /** The word that names the failure. */
  errorTitle: ReactNode;
  /** What to do next. */
  errorMessage?: ReactNode;
  /** Closing note when the list has ended; without it nothing is rendered in the done state. */
  doneMessage?: ReactNode;
  className?: string;
  /** Set on the button (the one element a test or a script needs to find). */
  "data-testid"?: string;
};

function LoadMore({ status, onLoadMore, label, retryLabel, errorTitle, errorMessage, doneMessage, className, "data-testid": testId }: LoadMoreProps) {
  if (status === "done") {
    return doneMessage ? <p className={cn("m-0 text-body text-text-muted", className)}>{doneMessage}</p> : null;
  }
  const loading = status === "loading";

  return (
    <div className={cn("flex flex-col items-start gap-stack", className)}>
      {status === "error" && (
        <Alert status="danger" title={errorTitle} role="alert">
          {errorMessage}
        </Alert>
      )}
      <Button
        variant="secondary"
        data-testid={testId}
        aria-busy={loading || undefined}
        aria-disabled={loading || undefined}
        onClick={loading ? undefined : onLoadMore}
      >
        {loading && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
        {status === "error" ? retryLabel : label}
      </Button>
    </div>
  );
}

export { LoadMore };
export type { LoadMoreProps, LoadMoreStatus };
