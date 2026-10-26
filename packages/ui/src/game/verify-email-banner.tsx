import type { ReactNode } from "react";

import { Alert } from "./alert";
import { Button } from "./button";

type VerifyEmailState = "idle" | "sending" | "sent" | "limited" | "failed";

// The banner can be closed (account-onboarding-simplification, banner decision): the page remembers the closing
// and shows it again after 7 days. Both props come together, so a close button always has its name.
type Dismiss = { onDismiss: () => void; dismissLabel: string } | { onDismiss?: undefined; dismissLabel?: undefined };

type VerifyEmailBannerProps = {
  /** "Potwierdź adres e-mail" (required). It never blocks play, so it must not say "to play". */
  title: ReactNode;
  /** Where the link goes and a reminder to check spam. It never claims the e-mail was sent (email-verification Q6). */
  children?: ReactNode;
  /** Label of the resend button (required), e.g. "Wyślij ponownie". */
  resendLabel: string;
  /** State of the resend request; the page owns it. */
  state?: VerifyEmailState;
  /** Result text for "sent", "limited" (with the time) and "failed" (what to do). */
  feedback?: ReactNode;
  onResend: () => void;
  className?: string;
} & Dismiss;

// Shown on / and /account while the e-mail is unconfirmed; it explains why to confirm and never blocks play
// (BR-26). The button keeps its place; the result is written below it, as a status for "sent" and an alert
// for "limited" and "failed".
function VerifyEmailBanner({ title, children, resendLabel, state = "idle", feedback, onResend, onDismiss, dismissLabel, className }: VerifyEmailBannerProps) {
  return (
    <Alert status="info" title={title} className={className}>
      {children}
      <div className="mt-group flex flex-col items-start gap-group">
        <div className="flex flex-wrap gap-group">
          <Button variant="secondary" loading={state === "sending"} disabled={state === "limited"} onClick={onResend}>
            {resendLabel}
          </Button>
          {onDismiss && (
            <Button variant="secondary" onClick={onDismiss}>
              {dismissLabel}
            </Button>
          )}
        </div>
        {feedback && state !== "idle" && state !== "sending" && (
          <p role={state === "sent" ? "status" : "alert"} className="m-0 text-meta text-text-secondary">
            {feedback}
          </p>
        )}
      </div>
    </Alert>
  );
}

export { VerifyEmailBanner };
export type { VerifyEmailBannerProps, VerifyEmailState };
