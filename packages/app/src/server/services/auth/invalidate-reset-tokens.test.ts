import { PasswordResetToken, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { invalidateResetTokens } from "./invalidate-reset-tokens";

describe("invalidateResetTokens", () => {
  it("marks only the user's unused tokens as used, through the given em", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T10:00:00.000Z"));
    const em = { nativeUpdate: vi.fn(async () => 2) };

    await invalidateResetTokens("user-1", em as unknown as EntityManager);

    expect(em.nativeUpdate).toHaveBeenCalledExactlyOnceWith(
      PasswordResetToken,
      { user: "user-1", usedAt: null },
      { usedAt: new Date("2026-10-28T10:00:00.000Z") },
    );
    vi.useRealTimers();
  });
});
