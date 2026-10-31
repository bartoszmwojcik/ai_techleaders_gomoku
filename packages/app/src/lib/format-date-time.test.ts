import { describe, expect, it } from "vitest";

import { formatFinishedAt, formatValidUntil } from "./format-date-time";

describe("formatValidUntil", () => {
  it("prints the weekday, date and time in the Warsaw zone, marked CET in winter", () => {
    expect(formatValidUntil("2026-10-30T09:00:00.000Z")).toBe("piątek, 30 października 10:00 CET");
    expect(formatValidUntil("2026-01-15T09:00:00Z")).toBe("czwartek, 15 stycznia 10:00 CET");
  });

  it("marks summer time CEST, not CET", () => {
    expect(formatValidUntil("2026-07-15T09:00:00Z")).toBe("środa, 15 lipca 11:00 CEST");
  });
});

describe("formatFinishedAt", () => {
  it("prints the date with the year and the time in the Warsaw zone, CET in winter", () => {
    expect(formatFinishedAt("2026-01-15T09:00:00Z")).toBe("15 stycznia 2026, 10:00 CET");
  });

  it("marks summer time CEST", () => {
    expect(formatFinishedAt("2026-07-15T09:00:00Z")).toBe("15 lipca 2026, 11:00 CEST");
  });

  it("moves the day over midnight by the zone, not by the device", () => {
    expect(formatFinishedAt("2026-10-31T23:30:00Z")).toBe("1 listopada 2026, 00:30 CET");
    expect(formatFinishedAt("2026-06-30T22:30:00Z")).toBe("1 lipca 2026, 00:30 CEST");
  });
});
