import { z } from "zod";

import { newPasswordSchema } from "./new-password-schema";
import { normalizeDisplayName, normalizeEmail } from "./normalize";

export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 24;
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

/** Registration password rules are the shared new-password rules (BR-28). */
export { newPasswordSchema as passwordSchema };

export const registerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: newPasswordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
