import { describe, expect, it } from "vitest";

import { clampReviewStep } from "./review";

describe("clampReviewStep", () => {
  it("keeps a step inside the game", () => {
    expect(clampReviewStep(3, 10)).toBe(3);
    expect(clampReviewStep(0, 10)).toBe(0);
    expect(clampReviewStep(10, 10)).toBe(10);
  });

  it("stops at the start and at the last move", () => {
    expect(clampReviewStep(-1, 10)).toBe(0);
    expect(clampReviewStep(11, 10)).toBe(10);
  });
});
