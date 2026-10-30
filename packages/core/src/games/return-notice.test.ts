import { describe, expect, it } from "vitest";

import { isReturnNoticeFresh, RETURN_NOTICE_THRESHOLD_MS, RETURN_NOTICE_WINDOW_MS, shouldShowReturnNotice } from "./return-notice";

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

describe("isReturnNoticeFresh", () => {
  it("uses a 10 s window", () => {
    expect(RETURN_NOTICE_WINDOW_MS).toBe(10_000);
  });

  it("is fresh up to and including the window, stale after it", () => {
    expect(isReturnNoticeFresh({ returnedAtMs: 1_000, readAtMs: 1_000 })).toBe(true);
    expect(isReturnNoticeFresh({ returnedAtMs: 1_000, readAtMs: 1_000 + 10_000 })).toBe(true);
    expect(isReturnNoticeFresh({ returnedAtMs: 1_000, readAtMs: 1_000 + 10_001 })).toBe(false);
  });

  it("treats a clock set back as fresh", () => {
    expect(isReturnNoticeFresh({ returnedAtMs: 50_000, readAtMs: 1_000 })).toBe(true);
  });

  it("takes a custom window", () => {
    expect(isReturnNoticeFresh({ returnedAtMs: 0, readAtMs: 5_001, windowMs: 5_000 })).toBe(false);
    expect(isReturnNoticeFresh({ returnedAtMs: 0, readAtMs: 5_000, windowMs: 5_000 })).toBe(true);
  });
});
