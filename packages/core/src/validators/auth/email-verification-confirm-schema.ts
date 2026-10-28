import { z } from "zod";

/** The token is 43 base64url characters; the bound only guards against huge input. */
export const VERIFICATION_TOKEN_MAX_LENGTH = 512;

/**
 * Input of `POST /api/auth/email-verification/confirm`. The token's exact shape is not
 * checked: an unknown or malformed token is `INVALID_TOKEN` (no oracle for the format).
 * `next` is only passed through `safeNextPath` by the route, so any string is accepted.
 */
export const emailVerificationConfirmSchema = z.object({
  token: z
    .string({ error: "Podaj token z linku." })
    .min(1, { error: "Podaj token z linku." })
    .max(VERIFICATION_TOKEN_MAX_LENGTH, { error: "Token jest za długi." }),
  next: z.string({ error: "Nieprawidłowa ścieżka." }).optional(),
});

export type EmailVerificationConfirmInput = z.infer<
  typeof emailVerificationConfirmSchema
>;
