import { describe, expect, it } from "vitest";

import frHome from "./catalogs/fr/home";
import plHome from "./catalogs/pl/home";
import { textsOf } from "./client";

describe("textsOf", () => {
  it("speaks Polish from the caller's fallback when the server passed nothing", () => {
    const t = textsOf<"home">(plHome);
    expect(t.locale).toBe("pl");
    expect(t("opponent.level", { level: 2 })).toBe("Poziom 2");
    expect(textsOf<"home">(plHome, {})("shared.retry")).toBe("Spróbuj ponownie");
  });

  it("speaks the language and the namespace the server handed down", () => {
    const t = textsOf<"home">(plHome, { locale: "fr", dict: frHome });
    expect(t.locale).toBe("fr");
    expect(t("opponent.level", { level: 2 })).toBe("Niveau 2");
  });
});
