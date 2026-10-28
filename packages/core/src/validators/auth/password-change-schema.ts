import { z } from "zod";

import { LOGIN_PASSWORD_MAX_LENGTH } from "./login-schema";
import { newPasswordSchema } from "./new-password-schema";

/**
 * Password change input. The current password has no registration rules (like
 * login); the new one follows `newPasswordSchema` and must differ from it.
 */
export const passwordChangeSchema = z
  .object({
    currentPassword: z
      .string({ error: "Podaj obecne hasło." })
      .min(1, { error: "Podaj obecne hasło." })
      .max(LOGIN_PASSWORD_MAX_LENGTH, {
        error: `Hasło może mieć najwyżej ${LOGIN_PASSWORD_MAX_LENGTH} znaków.`,
      }),
    newPassword: newPasswordSchema,
  })
  .refine((input) => input.newPassword !== input.currentPassword, {
    path: ["newPassword"],
    error: "Nowe hasło musi się różnić od obecnego.",
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
