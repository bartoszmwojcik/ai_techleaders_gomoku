import { z } from "zod";

import { normalizeDisplayName, normalizeEmail } from "./normalize";

export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 24;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignores everything past 72 bytes, so longer passwords are rejected. */
export const PASSWORD_MAX_BYTES = 72;

/** Reserved cores, compared against `normalizeDisplayName` output (G4). */
export const RESERVED_DISPLAY_NAMES: readonly string[] = [
  "usunietygracz",
  "admin",
  "administrator",
  "moderator",
  "system",
  "gomoku",
  "support",
];

// Explicit character set (no \p{L}) so Cyrillic/Greek homoglyphs are rejected.
const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9_\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+$/;

const utf8Encoder = new TextEncoder();

export const emailSchema = z
  .string({ error: "Podaj adres e-mail." })
  .transform(normalizeEmail)
  .pipe(
    z
      .string()
      .max(EMAIL_MAX_LENGTH, {
        error: `Adres e-mail może mieć najwyżej ${EMAIL_MAX_LENGTH} znaków.`,
      })
      .pipe(z.email({ error: "Podaj poprawny adres e-mail." })),
  );

export const displayNameSchema = z
  .string({ error: "Podaj nazwę gracza." })
  .trim()
  .min(DISPLAY_NAME_MIN_LENGTH, {
    error: `Nazwa gracza musi mieć co najmniej ${DISPLAY_NAME_MIN_LENGTH} znaki.`,
  })
  .max(DISPLAY_NAME_MAX_LENGTH, {
    error: `Nazwa gracza może mieć najwyżej ${DISPLAY_NAME_MAX_LENGTH} znaków.`,
  })
  .regex(DISPLAY_NAME_PATTERN, {
    error:
      "Nazwa gracza może zawierać tylko litery, cyfry oraz znaki _ i - (bez spacji).",
  })
  .refine(
    (name) => !RESERVED_DISPLAY_NAMES.includes(normalizeDisplayName(name)),
    {
      error: "Ta nazwa jest zastrzeżona.",
    },
  );

export const passwordSchema = z
  .string({ error: "Podaj hasło." })
  .refine((password) => [...password].length >= PASSWORD_MIN_LENGTH, {
    error: `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`,
  })
  .refine(
    (password) => utf8Encoder.encode(password).length <= PASSWORD_MAX_BYTES,
    { error: `Hasło może mieć najwyżej ${PASSWORD_MAX_BYTES} bajtów.` },
  );

export const registerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
