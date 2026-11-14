import { z } from "zod";

import { normalizeDisplayName } from "../validators/auth/normalize";
import { RESERVED_DISPLAY_NAMES } from "../validators/auth/register-schema";
import type { Seat } from "./types";

/** Longest nickname, counted in code points (E02-S07). */
export const NICKNAME_MAX_LENGTH = 24;

// ZWNJ/ZWJ are `Cf`, so the spec pattern alone would reject the joiners that normalization
// keeps; they are allowed explicitly (deviation from the letter of the spec, same intent).
const NICKNAME_PATTERN = /^[\p{L}\p{M}\p{N}\u200C\u200D _-]+$/u;

export const NICKNAME_INVALID_MESSAGE =
  "Nick może zawierać litery, cyfry, spacje oraz znaki _ i -.";
export const NICKNAME_RESERVED_MESSAGE = "Ta nazwa jest zastrzeżona.";
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
 * Whether a nickname would pass for a reserved display name (T-13): compared like an account
 * name (`normalizeDisplayName`), with spaces and joiners removed first, so that "Usunięty gracz"
 * and "Ad min" count as well.
 */
export function isReservedNickname(nickname: string): boolean {
  const core = normalizeDisplayName(nickname.replace(/[\s\u200C\u200D]/gu, ""));
  return RESERVED_DISPLAY_NAMES.includes(core);
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
        ctx.addIssue({
          code: "custom",
          message: NICKNAME_TOO_LONG_MESSAGE,
          params: { code: "NICKNAME_TOO_LONG", max: NICKNAME_MAX_LENGTH },
        });
      } else if (!NICKNAME_PATTERN.test(nickname)) {
        ctx.addIssue({
          code: "custom",
          message: NICKNAME_INVALID_MESSAGE,
          params: { code: "NICKNAME_INVALID" },
        });
      } else if (isReservedNickname(nickname)) {
        ctx.addIssue({
          code: "custom",
          message: NICKNAME_RESERVED_MESSAGE,
          params: { code: "NICKNAME_RESERVED" },
        });
      }
    }),
  )
  .transform((nickname) => (nickname === "" ? undefined : nickname));

/** Name shown for a guest without a nickname: derived from the seat on every read. */
export function defaultNickname(seat: Seat): string {
  return `Gracz ${seat}`;
}

/**
 * The seat a name stands for when it is exactly a default guest nickname (`defaultNickname(1)` or
 * `defaultNickname(2)`), otherwise `null`. Lets the UI translate the server-composed Polish text
 * for a guest seat without a new field in the API envelope.
 */
export function defaultNicknameSeat(name: string): Seat | null {
  if (name === defaultNickname(1)) return 1;
  if (name === defaultNickname(2)) return 2;
  return null;
}
