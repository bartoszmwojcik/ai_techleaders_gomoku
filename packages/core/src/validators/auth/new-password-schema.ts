import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt ignores everything past 72 bytes, so longer passwords are rejected. */
export const PASSWORD_MAX_BYTES = 72;

const utf8Encoder = new TextEncoder();

/**
 * Rules for a password being set (registration, password change, reset): at
 * least 8 characters and at most 72 UTF-8 bytes (BR-28). Never trimmed.
 */
export const newPasswordSchema = z
  .string({ error: "Podaj hasło." })
  .refine((password) => [...password].length >= PASSWORD_MIN_LENGTH, {
    error: `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków.`,
  })
  .refine(
    (password) => utf8Encoder.encode(password).length <= PASSWORD_MAX_BYTES,
    { error: `Hasło może mieć najwyżej ${PASSWORD_MAX_BYTES} bajtów.` },
  );
