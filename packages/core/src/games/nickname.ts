import { z } from "zod";

import type { Seat } from "./types";

/** Longest nickname, counted in code points (E02-S07). */
export const NICKNAME_MAX_LENGTH = 24;

// ZWNJ/ZWJ are `Cf`, so the spec pattern alone would reject the joiners that normalization
// keeps; they are allowed explicitly (deviation from the letter of the spec, same intent).
const NICKNAME_PATTERN = /^[\p{L}\p{M}\p{N}\u200C\u200D _-]+$/u;

export const NICKNAME_INVALID_MESSAGE =
  "Nick może zawierać litery, cyfry, spacje oraz znaki _ i -.";
export const NICKNAME_TOO_LONG_MESSAGE = `Nick może mieć najwyżej ${NICKNAME_MAX_LENGTH} znaków.`;

/**
 * Canonical form of a nickname: NFC; control characters become spaces; format characters
 * (bidi, zero-width) are dropped except ZWNJ/ZWJ, which scripts other than Latin need; every
 * space separator collapses into one space; the result is trimmed. May be empty.
 */
export function normalizeNickname(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/(?![‌‍])\p{Cf}/gu, "")
    .replace(/\p{Zs}+/gu, " ")
    .trim();
}

/**
 * A guest's nickname (E02-S07): optional text of 1-24 code points (letters, marks, digits,
 * spaces, `_`, `-`). Empty after normalization means "no nickname" and yields `undefined`,
 * so the default name applies.
 */
export const nicknameSchema = z
  .string({ error: NICKNAME_INVALID_MESSAGE })
  .transform(normalizeNickname)
  .pipe(
    z.string().superRefine((nickname, ctx) => {
      if (nickname === "") return;
      if (Array.from(nickname).length > NICKNAME_MAX_LENGTH) {
        ctx.addIssue({ code: "custom", message: NICKNAME_TOO_LONG_MESSAGE });
      } else if (!NICKNAME_PATTERN.test(nickname)) {
        ctx.addIssue({ code: "custom", message: NICKNAME_INVALID_MESSAGE });
      }
    }),
  )
  .transform((nickname) => (nickname === "" ? undefined : nickname));

/** Name shown for a guest without a nickname: derived from the seat on every read. */
export function defaultNickname(seat: Seat): string {
  return `Gracz ${seat}`;
}
