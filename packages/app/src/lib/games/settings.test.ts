import { describe, expect, it } from "vitest";

import enHome from "@/i18n/catalogs/en/home";
import frHome from "@/i18n/catalogs/fr/home";
import { textsOf } from "@/i18n/client";

import {
  DEFAULT_SETTINGS,
  homeRulesLabel,
  rulesLabel,
  settingsBody,
  settingsLabel,
  TIME_OPTIONS,
  timeOptions,
  VARIANT_NAME,
  VARIANT_OPTIONS,
  variantOf,
  variantOptions,
} from "./settings";

const fr = textsOf<"home">(frHome, { locale: "fr", dict: frHome });
const en = textsOf<"home">(enHome, { locale: "en", dict: enHome });

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

  it("words the home page rules line per variant", () => {
    expect(homeRulesLabel("classic")).toBe("Swobodne zasady · plansza 15×15 · 10 minut na gracza");
    expect(homeRulesLabel("paper")).toBe("Kółko i krzyżyk na kartce papieru, 5 w linii, gra na czas.");
  });

  it("speaks the reader's language (E15-S03)", () => {
    expect(VARIANT_NAME).toEqual({ classic: "Klasyczny", paper: "Papier i ołówek" });
    expect(variantOptions(fr).map(({ label }) => label)).toEqual(["Classique", "Papier et crayon"]);
    expect(timeOptions(fr)[0]).toEqual({ value: "60000", label: "1\u00a0min" });
    expect(settingsLabel("paper", 180_000, fr)).toBe("Papier et crayon · 3\u00a0min");
    expect(rulesLabel("paper", 120_000, en)).toBe("Pen and paper · 2 min per player");
    expect(rulesLabel("classic", 600_000, fr)).toBe("Règles libres · plateau 15×15 · 10\u00a0minutes par joueur");
    expect(rulesLabel("classic", 60_000, en)).toBe("Freestyle rules · 15×15 board · 1 minute per player");
    expect(homeRulesLabel("paper", en)).toBe("Noughts and crosses on a sheet of paper, 5 in a row, against the clock.");
    expect(homeRulesLabel("classic", en)).toBe("Freestyle rules · 15×15 board · 10 minutes per player");
  });
});
