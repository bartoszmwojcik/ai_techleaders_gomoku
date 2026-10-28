import { PasswordResetToken, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { createInvalidateResetTokens } from "./invalidate-reset-tokens";

describe("createInvalidateResetTokens", () => {
  it("marks only the user's unused tokens as used at the clock's time, through the given em", async () => {
    const now = new Date("2026-10-28T10:00:00.000Z");
    const invalidateResetTokens = createInvalidateResetTokens({
      clock: { now: () => now },
    });
    const em = { nativeUpdate: vi.fn(async () => 2) };

    await invalidateResetTokens("user-1", em as unknown as EntityManager);

    expect(em.nativeUpdate).toHaveBeenCalledExactlyOnceWith(
      PasswordResetToken,
      { user: "user-1", usedAt: null },
      { usedAt: now },
    );
  });
});
