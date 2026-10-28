import type { EmailSender } from "./email-sender";

/** Used when no transport is configured: every send fails with a readable error. */
export class UnconfiguredEmailSender implements EmailSender {
  async send(): Promise<never> {
    throw new Error(
      "No email transport is configured (set EMAIL_TRANSPORT); cannot send email.",
    );
  }
}
