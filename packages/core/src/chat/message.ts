import { CHAT_BLOCKED_TLDS, CHAT_MAX_COMBINING_RUN, CHAT_RAW_MAX_UNITS } from "./constants";
import type { ChatRejection } from "./types";

export type ChatTextResult = { ok: true; text: string } | { ok: false; reason: ChatRejection };

/** Polish sentences for the refusals; they never repeat the refused text. */
export const CHAT_REJECTION_MESSAGES: Record<ChatRejection, string> = {
  not_text: "Wiadomość musi być tekstem.",
  empty: "Wpisz wiadomość.",
  too_long: "Wiadomość jest za długa.",
  control_char: "Wiadomość nie może zawierać znaków sterujących ani nowych linii.",
  invisible_char: "Wiadomość nie może zawierać niewidocznych znaków.",
  combining_run: "Wiadomość zawiera zbyt wiele znaków łączących.",
  url: "Wiadomość nie może zawierać adresów internetowych.",
};

const PICTOGRAPH = /^\p{Extended_Pictographic}$/u;
const ZWJ = "‍";
// Fillers that render as nothing, and the combining grapheme joiner: not in `Cf`, still invisible (R8).
const INVISIBLE_CODE_POINTS = new Set([0x034f, 0x115f, 0x1160, 0x3164, 0xffa0, 0x2800]);
const CONTROL_CATEGORY = /^[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]$/u;
const INVISIBLE_CATEGORY = /^[\p{Cf}\p{Co}\p{Cn}]$/u;
const SPACE_SEPARATOR = /^\p{Zs}$/u;
const MARK = /^\p{M}$/u;
// Variation selectors other than U+FE0F (emoji presentation), in the BMP and the supplement.
const VARIATION_SELECTOR = /^[︀-︎\u{E0100}-\u{E01EF}]$/u;

const SCHEME = /[a-z][a-z0-9+.-]*:\/\//i;
const DANGEROUS_SCHEME = /(?:^|[^\p{L}\p{N}])(?:mailto|javascript|data|file|vbscript):/iu;
const WWW = /(?:^|[^\p{L}\p{N}])www\./iu;
const IPV4 = /(?:^|[^\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d])/;
const DOMAIN = new RegExp(`[\\p{L}\\p{N}][\\p{L}\\p{N}-]*\\.(?:${CHAT_BLOCKED_TLDS.join("|")})(?![\\p{L}\\p{N}])`, "iu");

/** A message length in code points after NFKC: what the limit and the counter in the form count. */
export function chatMessageLength(text: string): number {
  return Array.from(text.normalize("NFKC")).length;
}

function invisibleOrControl(codePoints: string[]): ChatRejection | null {
  let combining = 0;
  for (const [index, char] of codePoints.entries()) {
    if (CONTROL_CATEGORY.test(char)) return "control_char";
    const joinerInEmoji =
      char === ZWJ &&
      PICTOGRAPH.test(codePoints[index - 1] ?? "") &&
      PICTOGRAPH.test(codePoints[index + 1] ?? "");
    if (joinerInEmoji) continue;
    if (
      INVISIBLE_CATEGORY.test(char) ||
      INVISIBLE_CODE_POINTS.has(char.codePointAt(0)!) ||
      VARIATION_SELECTOR.test(char) ||
      (SPACE_SEPARATOR.test(char) && char !== " ")
    ) {
      return "invisible_char";
    }
    combining = MARK.test(char) ? combining + 1 : 0;
    if (combining > CHAT_MAX_COMBINING_RUN) return "combining_run";
  }
  return null;
}

function containsUrl(text: string): boolean {
  // The ideographic full stop reads as a dot to a human, and NFKC leaves it as it is.
  const dotted = text.replaceAll("。", ".");
  return (
    SCHEME.test(dotted) ||
    DANGEROUS_SCHEME.test(dotted) ||
    WWW.test(dotted) ||
    IPV4.test(dotted) ||
    DOMAIN.test(dotted)
  );
}

/**
 * Turns what a participant typed into the text that is stored (BR-32, R8, R10): NFKC, ASCII spaces
 * trimmed, one line of 1..`maxLength` code points, no control or invisible characters, no addresses.
 * The stored text is the normalized one. Pure: the server and the form use the same function.
 */
export function normalizeChatMessage(raw: unknown, limits: { maxLength: number }): ChatTextResult {
  if (typeof raw !== "string") return { ok: false, reason: "not_text" };
  if (raw.length > CHAT_RAW_MAX_UNITS) return { ok: false, reason: "too_long" };
  const codePoints = Array.from(raw.normalize("NFKC"));
  const refused = invisibleOrControl(codePoints);
  if (refused) return { ok: false, reason: refused };
  const text = codePoints.join("").replace(/^ +| +$/g, "");
  if (text === "") return { ok: false, reason: "empty" };
  if (Array.from(text).length > limits.maxLength) return { ok: false, reason: "too_long" };
  if (containsUrl(text)) return { ok: false, reason: "url" };
  return { ok: true, text };
}
