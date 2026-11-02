import { z } from "zod";

import { LOGIN_PASSWORD_MAX_LENGTH } from "./login-schema";
import { VERIFICATION_TOKEN_MAX_LENGTH } from "./email-verification-confirm-schema";
import { displayNameSchema, emailSchema } from "./register-schema";

/** Input of `PATCH /api/auth/display-name` (E05-S01): the same rules as at registration. */
export const displayNameChangeSchema = z.object({ displayName: displayNameSchema });
export type DisplayNameChangeInput = z.infer<typeof displayNameChangeSchema>;

/** Input of `POST /api/auth/email-change`: the new address and the current password (no registration rules, like login). */
export const emailChangeSchema = z.object({
  newEmail: emailSchema,
  currentPassword: z
    .string({ error: "Podaj obecne hasło." })
    .min(1, { error: "Podaj obecne hasło." })
    .max(LOGIN_PASSWORD_MAX_LENGTH, {
      error: `Hasło może mieć najwyżej ${LOGIN_PASSWORD_MAX_LENGTH} znaków.`,
    }),
});
export type EmailChangeInput = z.infer<typeof emailChangeSchema>;

/** Input of `POST /api/auth/email-change/confirm`; the token's shape is not checked (no format oracle). */
export const emailChangeConfirmSchema = z.object({
  token: z
    .string({ error: "Podaj token z linku." })
    .min(1, { error: "Podaj token z linku." })
    .max(VERIFICATION_TOKEN_MAX_LENGTH, { error: "Token jest za długi." }),
});
export type EmailChangeConfirmInput = z.infer<typeof emailChangeConfirmSchema>;
