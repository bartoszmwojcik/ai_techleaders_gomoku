import { describe, expect, it } from "vitest";

import { formatDateTime, pairLabel } from "./labels";

describe("pairLabel", () => {
  it("names the kinds in Polish and keeps an unknown one", () => {
    expect(pairLabel({ kinds: ["account", "guest"] })).toBe("konto – gość");
    expect(pairLabel({ kinds: ["agent", "guest"] })).toBe("agent – gość");
    expect(pairLabel({ kinds: ["account", "bot"] })).toBe("konto – bot");
    expect(pairLabel({ kinds: ["bot", "guest"] })).toBe("bot – gość");
    expect(pairLabel({ kinds: ["account", "robot"] })).toBe("konto – robot");
  });
});

describe("formatDateTime", () => {
  it("uses Europe/Warsaw whatever the server zone is", () => {
    expect(formatDateTime(new Date("2026-07-01T10:00:00Z"))).toBe("1.07.2026, 12:00");
    expect(formatDateTime(new Date("2026-12-01T10:00:00Z"))).toBe("1.12.2026, 11:00");
  });
});
