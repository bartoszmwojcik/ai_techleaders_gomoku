import { describe, expect, it } from "vitest";

import { RETURN_NOTICE_THRESHOLD_MS, shouldShowReturnNotice } from "./return-notice";

describe("shouldShowReturnNotice", () => {
  it("uses a 30 s threshold", () => {
    expect(RETURN_NOTICE_THRESHOLD_MS).toBe(30_000);
  });

  it("is silent at and below the threshold, shown above it", () => {
    expect(shouldShowReturnNotice({ hiddenAtMs: 1_000, returnedAtMs: 1_000 + 29_999 })).toBe(false);
    expect(shouldShowReturnNotice({ hiddenAtMs: 1_000, returnedAtMs: 1_000 + 30_000 })).toBe(false);
    expect(shouldShowReturnNotice({ hiddenAtMs: 1_000, returnedAtMs: 1_000 + 30_001 })).toBe(true);
  });

  it("is silent when the tab was never seen hidden", () => {
    expect(shouldShowReturnNotice({ hiddenAtMs: null, returnedAtMs: 99_999_999 })).toBe(false);
  });

  it("is silent when the clock went backwards", () => {
    expect(shouldShowReturnNotice({ hiddenAtMs: 100_000, returnedAtMs: 10_000 })).toBe(false);
  });

  it("takes a custom threshold", () => {
    expect(shouldShowReturnNotice({ hiddenAtMs: 0, returnedAtMs: 5_001, thresholdMs: 5_000 })).toBe(true);
    expect(shouldShowReturnNotice({ hiddenAtMs: 0, returnedAtMs: 5_000, thresholdMs: 5_000 })).toBe(false);
  });
});
