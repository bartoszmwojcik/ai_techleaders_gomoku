/** A message to deliver; both bodies are required so adapters need no template logic. */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Port for outgoing mail. Implementations throw when delivery fails; callers map that to
 * `502 EMAIL_SEND_FAILED`. Implementations must never log the address or the body.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Time source injected into services so tests control "now". */
export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };
