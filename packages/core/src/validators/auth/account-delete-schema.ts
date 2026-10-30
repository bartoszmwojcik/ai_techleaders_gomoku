import { z } from "zod";

import { LOGIN_PASSWORD_MAX_LENGTH } from "./login-schema";

export const ACCOUNT_DELETE_CONFIRM_MESSAGE = "Zaznacz potwierdzenie, aby usunąć konto.";

/**
 * Account deletion input (E01-S06): the current password, checked by the server like at login
 * (no registration rules), and the explicit confirmation that the deletion cannot be undone.
 */
export const accountDeleteSchema = z.object({
  password: z
    .string({ error: "Podaj hasło." })
    .min(1, { error: "Podaj hasło." })
    .max(LOGIN_PASSWORD_MAX_LENGTH, {
      error: `Hasło może mieć najwyżej ${LOGIN_PASSWORD_MAX_LENGTH} znaków.`,
    }),
  confirm: z.literal(true, { error: ACCOUNT_DELETE_CONFIRM_MESSAGE }),
});

export type AccountDeleteInput = z.infer<typeof accountDeleteSchema>;
