import type { ServerConfig } from "../../config";
import { BrevoEmailSender } from "./brevo-email-sender";
import type { Clock, EmailSender } from "./email-sender";
import { FileEmailSender } from "./file-email-sender";
import { UnconfiguredEmailSender } from "./unconfigured-email-sender";

type Deps = {
  serverConfig: ServerConfig;
  clock: Clock;
  fetch: typeof fetch;
};

const EMAIL_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Picks the mail transport from the validated config (`EMAIL_TRANSPORT`). `readServerConfig`
 * already rejects unknown values, so a bad setup
 * never degrades into another transport. An unset transport, or `brevo` without its key or a valid
 * sender address, yields the failing sender (502 on send; the app keeps running, #34 Q1) and
 * `brevo` logs a warning naming only the variables, never their values.
 */
export function createEmailSender({
  serverConfig,
  clock,
  fetch,
}: Deps): EmailSender {
  switch (serverConfig.emailTransport) {
    case "file":
      return new FileEmailSender({
        outboxPath: serverConfig.emailOutboxPath,
        from: serverConfig.emailFrom,
        clock,
      });
    case "brevo": {
      const { brevoApiKey, emailFromAddress } = serverConfig;
      if (
        !brevoApiKey ||
        !emailFromAddress ||
        !EMAIL_ADDRESS.test(emailFromAddress)
      ) {
        console.warn(
          "EMAIL_TRANSPORT=brevo needs BREVO_API_KEY and a valid EMAIL_FROM_ADDRESS; e-mail sending is disabled.",
        );
        return new UnconfiguredEmailSender();
      }
      return new BrevoEmailSender({
        apiKey: brevoApiKey,
        fromAddress: emailFromAddress,
        fromName: serverConfig.emailFrom,
        fetch,
      });
    }
    default:
      return new UnconfiguredEmailSender();
  }
}
