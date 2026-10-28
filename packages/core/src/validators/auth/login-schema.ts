import { z } from "zod";

import { emailSchema } from "./register-schema";

/** Upper bound that only guards against huge input; it is not a password rule. */
export const LOGIN_PASSWORD_MAX_LENGTH = 1024;

/**
 * Login input shape. Deliberately has none of the registration password rules
 * (min length, byte limit): logging in must not reveal them.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Podaj hasło." })
    .min(1, { error: "Podaj hasło." })
    .max(LOGIN_PASSWORD_MAX_LENGTH, {
      error: `Hasło może mieć najwyżej ${LOGIN_PASSWORD_MAX_LENGTH} znaków.`,
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;
