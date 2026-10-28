import { PasswordResetToken } from "@gomoku/db";
import type { Clock } from "../email/email-sender";

import type { InvalidateResetTokens } from "./user-service";

/**
 * Builds the function that marks the user's unused password reset tokens as used. It writes only
 * through the `em` it is given - inside a transaction that is the callback's `tx` (an injected
 * fork is outside it). The time comes from the injected `clock`.
 */
export const createInvalidateResetTokens =
  ({ clock }: { clock: Clock }): InvalidateResetTokens =>
  async (userId, em) => {
    await em.nativeUpdate(
      PasswordResetToken,
      { user: userId, usedAt: null },
      { usedAt: clock.now() },
    );
  };
