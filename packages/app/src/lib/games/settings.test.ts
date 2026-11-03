import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, rulesLabel, settingsBody, settingsLabel, TIME_OPTIONS, VARIANT_OPTIONS, variantOf } from "./settings";

describe("game settings", () => {
  it("defaults to the classic game and a three minute paper clock", () => {
    expect(DEFAULT_SETTINGS).toEqual({ variant: "classic", timeControlMs: 180_000 });
  });

  it("offers both variants and the four clocks", () => {
    expect(VARIANT_OPTIONS).toEqual([
      { value: "classic", label: "Klasyczny" },
      { value: "paper", label: "Papier i ołówek" },
    ]);
    expect(TIME_OPTIONS.map((option) => option.label)).toEqual(["1 min", "2 min", "3 min", "5 min"]);
    expect(TIME_OPTIONS.map((option) => option.value)).toEqual(["60000", "120000", "180000", "300000"]);
  });

  it("reads a variant, falling back to the classic one", () => {
    expect(variantOf("paper")).toBe("paper");
    expect(variantOf("classic")).toBe("classic");
    expect(variantOf("other")).toBe("classic");
  });

  it("sends nothing for the classic game and both fields for the paper one", () => {
    expect(settingsBody({ variant: "classic", timeControlMs: 300_000 })).toEqual({});
    expect(settingsBody({ variant: "paper", timeControlMs: 300_000 })).toEqual({ variant: "paper", timeControlMs: 300_000 });
  });

  it("names what is played", () => {
    expect(settingsLabel("paper", 180_000)).toBe("Papier i ołówek · 3 min");
    expect(settingsLabel("classic", 600_000)).toBe("Klasyczny · 10 min");
  });

  it("words the rules of an invitation per variant", () => {
    expect(rulesLabel("classic", 600_000)).toBe("Swobodne zasady · plansza 15×15 · 10 minut na gracza");
    expect(rulesLabel("paper", 120_000)).toBe("Papier i ołówek · 2 min na gracza");
  });
});
