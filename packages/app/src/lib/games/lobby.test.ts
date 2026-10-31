import { describe, expect, it } from "vitest";

import { sinceLabel } from "./lobby";

describe("sinceLabel", () => {
  it.each([
    [0, "szuka od chwili"],
    [59_999, "szuka od chwili"],
    [60_000, "szuka od 1 min"],
    [185_000, "szuka od 3 min"],
  ])("says how long they have been looking (%i ms)", (ms, label) => {
    expect(sinceLabel(ms)).toBe(label);
  });
});
