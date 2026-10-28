import { PasswordResetToken } from "@gomoku/db";

import type { InvalidateResetTokens } from "./user-service";

/**
 * Marks the user's unused password reset tokens as used. Writes only through the `em` it is
 * given - inside a transaction that is the callback's `tx` (an injected fork is outside it).
 */
export const invalidateResetTokens: InvalidateResetTokens = async (
  userId,
  em,
) => {
  await em.nativeUpdate(
    PasswordResetToken,
    { user: userId, usedAt: null },
    { usedAt: new Date() },
  );
};
