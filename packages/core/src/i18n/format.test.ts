import { describe, expect, it } from "vitest";

import { DISPLAY_TIME_ZONE, formatDateTime, formatMegabytes, formatNumber } from "./format";

describe("format", () => {
  it("prints megabytes with the language's unit", () => {
    expect(formatMegabytes("pl", 16)).toBe("16 MB");
    expect(formatMegabytes("en", 16)).toBe("16 MB");
    expect(formatMegabytes("de", 16)).toBe("16 MB");
    expect(formatMegabytes("fr", 16)).toBe("16\u202fMo");
  });

  it("groups numbers per language", () => {
    expect(formatNumber("en", 12345)).toBe("12,345");
    expect(formatNumber("de", 12345)).toBe("12.345");
  });

  it("prints dates in the Warsaw zone whatever the language", () => {
    // 23:30 UTC on 31 December is already 1 January in Warsaw.
    const date = new Date("2026-12-31T23:30:00Z");
    expect(DISPLAY_TIME_ZONE).toBe("Europe/Warsaw");
    expect(formatDateTime("en", date, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe(
      "January 1, 2027 at 00:30",
    );
    expect(formatDateTime("fr", date, { day: "numeric", month: "long" })).toBe("1 janvier");
    expect(formatDateTime("pl", date)).toBe(new Intl.DateTimeFormat("pl", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(date));
  });
});
