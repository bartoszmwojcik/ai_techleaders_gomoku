import type { EmailMessage } from "../email/email-sender";
import { escapeHtml } from "./email-verification-message";

export const RESET_LINK_VALID_HOURS = 1;

export type ResetMessageInput = {
  /** Recipient address. */
  to: string;
  /** Player's display name; escaped in the HTML body. */
  name: string;
  /** Raw one-time token (goes only into the link, never into logs). */
  token: string;
  /** `APP_ORIGIN`, e.g. `https://gomoku.example`. */
  origin: string;
};

export function buildResetLink({
  origin,
  token,
}: Pick<ResetMessageInput, "origin" | "token">): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Pure template of the password reset message (spec password-reset). No I/O. The wording
 * never hints at whether an account exists: only the owner of a confirmed address sees it.
 */
export function buildResetMessage(input: ResetMessageInput): EmailMessage {
  const link = buildResetLink(input);
  const subject = "Reset hasła w Gomoku";
  const greeting = `Cześć ${input.name},`;
  const intro = "ktoś poprosił o ustawienie nowego hasła do konta w Gomoku.";
  const cta = "Ustaw nowe hasło";
  const validity = `Link jest ważny ${RESET_LINK_VALID_HOURS} godzinę i działa tylko raz.`;
  const ignore =
    "Jeśli to nie Ty prosiłeś o reset, zignoruj tę wiadomość - hasło się nie zmieni.";

  const text = [
    `${greeting} ${intro}`,
    `${cta}: ${link}`,
    validity,
    ignore,
  ].join("\n\n");
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
