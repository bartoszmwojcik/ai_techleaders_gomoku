import type { EmailMessage } from "../email/email-sender";
import { escapeHtml } from "./email-verification-message";

export const EMAIL_CHANGE_LINK_VALID_HOURS = 24;

export type EmailChangeMessageInput = {
  /** The new address: the link goes there. */
  to: string;
  /** Player's display name; escaped in the HTML body. */
  name: string;
  /** Raw one-time token (goes only into the link, never into logs). */
  token: string;
  /** `APP_ORIGIN`, e.g. `https://gomoku.example`. */
  origin: string;
};

export function buildEmailChangeLink({ origin, token }: Pick<EmailChangeMessageInput, "origin" | "token">): string {
  return `${origin.replace(/\/+$/, "")}/confirm-email-change?token=${encodeURIComponent(token)}`;
}

/** Pure template of the message with the confirmation link of a new address (E05-S01). No I/O. */
export function buildEmailChangeMessage(input: EmailChangeMessageInput): EmailMessage {
  const link = buildEmailChangeLink(input);
  const subject = "Potwierdź nowy adres e-mail w Gomoku";
  const greeting = `Cześć ${input.name},`;
  const intro = "ten adres został podany jako nowy adres e-mail Twojego konta w Gomoku.";
  const cta = "Potwierdź nowy adres";
  const validity = `Link jest ważny ${EMAIL_CHANGE_LINK_VALID_HOURS} godziny i działa tylko raz. Do jego użycia konto korzysta z dotychczasowego adresu.`;
  const ignore = "Jeśli to nie Ty, zignoruj tę wiadomość - adres konta się nie zmieni.";

  const text = [`${greeting} ${intro}`, `${cta}: ${link}`, validity, ignore].join("\n\n");
  const safeLink = escapeHtml(link);
  const html = [
    `<p>${escapeHtml(greeting)} ${intro}</p>`,
    `<p><a href="${safeLink}">${cta}</a></p>`,
    `<p>Jeśli przycisk nie działa, skopiuj adres do przeglądarki: ${safeLink}</p>`,
    `<p>${validity}</p>`,
    `<p>${ignore}</p>`,
  ].join("\n");

  return { to: input.to, subject, text, html };
}

export type EmailChangedNoticeInput = {
  /** The previous address of the account. */
  to: string;
  name: string;
  /** The new address, masked by `maskEmail`. */
  newEmailMasked: string;
};

/** `ala.kowalska@example.com` -> `a***@example.com`: enough to recognise it, not to reuse it. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 1) return "***";
  return `${address.slice(0, 1)}***${address.slice(at)}`;
}

/** Pure template of the notice that goes to the previous address after a change (E05-S01, Q2). */
export function buildEmailChangedNotice(input: EmailChangedNoticeInput): EmailMessage {
  const subject = "Adres e-mail Twojego konta w Gomoku został zmieniony";
  const greeting = `Cześć ${input.name},`;
  const intro = `adres e-mail Twojego konta w Gomoku zmieniono na ${input.newEmailMasked}. Od teraz tam trafiają wiadomości z konta.`;
  const action =
    "Jeśli to nie Ty, ktoś zna Twoje hasło albo ma dostęp do Twojej sesji: skontaktuj się z administratorem serwisu.";

  const text = [`${greeting} ${intro}`, action].join("\n\n");
  const html = [
    `<p>${escapeHtml(greeting)} ${escapeHtml(intro)}</p>`,
    `<p>${escapeHtml(action)}</p>`,
  ].join("\n");
  return { to: input.to, subject, text, html };
}
