import { describe, expect, it } from "vitest";

import { clockDuration, formatClock } from "./format-clock";

describe("formatClock", () => {
  it("formats minutes and padded seconds", () => {
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(581_000)).toBe("9:41");
    expect(formatClock(5_000)).toBe("0:05");
  });

  it("rounds a part of a second up so the clock never shows 0:00 while time is left", () => {
    expect(formatClock(1)).toBe("0:01");
    expect(formatClock(59_001)).toBe("1:00");
  });

  it("shows 0:00 for zero and negative values", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-4_000)).toBe("0:00");
  });
});

describe("clockDuration", () => {
  it("returns an ISO 8601 duration", () => {
    expect(clockDuration(581_000)).toBe("PT9M41S");
    expect(clockDuration(-1)).toBe("PT0M0S");
  });
});
