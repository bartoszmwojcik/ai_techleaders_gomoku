import type { EmailMessage, EmailSender, SendOptions } from "./email-sender";

export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

/** Backstop for callers that pass no signal; request callers use a shorter `AbortSignal.timeout`. */
export const BREVO_TIMEOUT_MS = 10_000;

/**
 * Delivery failure. The message is a fixed string and `code` a short identifier (`BREVO_HTTP_429`,
 * `BREVO_NETWORK`, `BREVO_TIMEOUT`), so `describeError` can log it without the API key, the
 * address, the response body or the message content (tokens, links). No `cause` is attached.
 */
export class BrevoSendError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("Brevo send failed.");
    this.name = "BrevoSendError";
    this.code = code;
  }
}

type Options = {
  apiKey: string;
  fromAddress: string;
  fromName: string;
  /** Global `fetch`, injected so tests make no network calls. */
  fetch: typeof fetch;
};

/** Sends mail through the Brevo transactional API (HTTPS, no extra dependency). */
export class BrevoEmailSender implements EmailSender {
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ apiKey, fromAddress, fromName, fetch }: Options) {
    this.apiKey = apiKey;
    this.fromAddress = fromAddress;
    this.fromName = fromName;
    this.fetchImpl = fetch;
  }

  async send(message: EmailMessage, options: SendOptions = {}): Promise<void> {
    const timeout = AbortSignal.timeout(BREVO_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;

    let response: Response;
    try {
      response = await this.fetchImpl(BREVO_SEND_URL, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: this.fromAddress, name: this.fromName },
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
        // fetch keeps custom headers on a cross-origin redirect, so a redirect would leak the api-key.
        redirect: "error",
        signal,
      });
    } catch {
      throw new BrevoSendError(
        signal.aborted ? "BREVO_TIMEOUT" : "BREVO_NETWORK",
      );
    }

    // The body is never read: it can echo the request.
    void response.body?.cancel();
    if (response.status !== 201) {
      throw new BrevoSendError(`BREVO_HTTP_${response.status}`);
    }
  }
}
