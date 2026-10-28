/** A message to deliver; both bodies are required so adapters need no template logic. */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Per-call options of `EmailSender.send`. */
export type SendOptions = {
  /** Aborts the delivery; the send then rejects. Callers use `AbortSignal.timeout(ms)`. */
  signal?: AbortSignal;
};

/**
 * Port for outgoing mail. Implementations throw when delivery fails; callers map that to
 * `502 EMAIL_SEND_FAILED`. Implementations must never log the address or the body.
 * Sending is awaited inside a user request, so implementations MUST respect
 * `options.signal`: stop work and reject once it aborts (e.g. pass it to the SMTP/HTTP
 * client and set its own connection/socket timeouts); a send that never settles is a bug.
 */
export interface EmailSender {
  send(message: EmailMessage, options?: SendOptions): Promise<void>;
}

/** Time source injected into services so tests control "now". */
export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };
