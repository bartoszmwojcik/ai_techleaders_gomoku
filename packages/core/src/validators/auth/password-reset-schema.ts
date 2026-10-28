import { z } from "zod";

import { newPasswordSchema } from "./new-password-schema";
import { emailSchema } from "./register-schema";

/** The token is 43 base64url characters; the bound only guards against huge input. */
export const PASSWORD_RESET_TOKEN_MAX_LENGTH = 512;

/**
 * Input of `POST /api/auth/password-reset/request`. Only the shape is checked
 * (the e-mail is normalized); whether an account exists is never revealed.
 */
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

/**
 * Input of `POST /api/auth/password-reset/confirm`. The token's exact shape is
 * not checked: an unknown or malformed token is `INVALID_TOKEN` (no oracle for
 * the format). The new password follows `newPasswordSchema` (BR-28).
 */
export const passwordResetConfirmSchema = z.object({
  token: z
    .string({ error: "Podaj token z linku." })
    .min(1, { error: "Podaj token z linku." })
    .max(PASSWORD_RESET_TOKEN_MAX_LENGTH, { error: "Token jest za długi." }),
  newPassword: newPasswordSchema,
});

export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;
export type PasswordResetConfirmInput = z.infer<
  typeof passwordResetConfirmSchema
>;
