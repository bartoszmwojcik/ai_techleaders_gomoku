import { safeNextPath } from "@gomoku/core";

import type { EmailMessage } from "../email/email-sender";

export const VERIFICATION_LINK_VALID_HOURS = 24;

export type VerificationMessageInput = {
  /** Recipient address. */
  to: string;
  /** Player's display name; escaped in the HTML body. */
  name: string;
  /** Raw one-time token (goes only into the link, never into logs). */
  token: string;
  /** `APP_ORIGIN`, e.g. `https://gomoku.example`. */
  origin: string;
  /** Optional post-confirmation path; passes through `safeNextPath`, dropped when unsafe or "/". */
  next?: string;
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] as string);
}

export function buildVerificationLink({
  origin,
  token,
  next,
}: Pick<VerificationMessageInput, "origin" | "token" | "next">): string {
  const base = origin.replace(/\/+$/, "");
  let link = `${base}/verify-email?token=${encodeURIComponent(token)}`;
  const safeNext = safeNextPath(next);
  if (safeNext !== "/") link += `&next=${encodeURIComponent(safeNext)}`;
  return link;
}

/** Pure template of the e-mail confirmation message (spec email-verification, Q5/Q8). No I/O. */
export function buildVerificationMessage(
  input: VerificationMessageInput,
): EmailMessage {
  const link = buildVerificationLink(input);
  const subject = "Potwierdź adres e-mail w Gomoku";
  const reason =
    "Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła.";
  const validity = `Link jest ważny ${VERIFICATION_LINK_VALID_HOURS} godziny.`;
  const ignore =
    "Jeśli to nie Ty zakładałeś konto w Gomoku, zignoruj tę wiadomość.";
  const greeting = `Cześć ${input.name},`;
  const intro = "potwierdź swój adres e-mail w Gomoku.";
  const cta = "Potwierdź adres e-mail";

  const text = [
    `${greeting} ${intro}`,
    reason,
    `${cta}: ${link}`,
    validity,
    ignore,
  ].join("\n\n");
  const safeLink = escapeHtml(link);
  const html = [
    `<p>${escapeHtml(greeting)} ${intro}</p>`,
    `<p>${reason}</p>`,
    `<p><a href="${safeLink}">${cta}</a></p>`,
    `<p>Jeśli przycisk nie działa, skopiuj adres do przeglądarki: ${safeLink}</p>`,
    `<p>${validity}</p>`,
    `<p>${ignore}</p>`,
  ].join("\n");

  return { to: input.to, subject, text, html };
}
