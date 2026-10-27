import { describe, expect, it } from "vitest";

import { normalizeDisplayName, normalizeEmail } from "./normalize";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Ala@Example.COM \n")).toBe("ala@example.com");
  });
});

describe("normalizeDisplayName", () => {
  it("lower-cases", () => {
    expect(normalizeDisplayName("AlaMaKota")).toBe("alamakota");
  });

  it("maps every Polish letter to its Latin counterpart", () => {
    expect(normalizeDisplayName("ĄĆĘŁŃÓŚŹŻ ąćęłńóśźż".replace(" ", ""))).toBe(
      "acelnoszzacelnoszz",
    );
  });

  it("removes underscores and hyphens", () => {
    expect(normalizeDisplayName("a_l-a_7")).toBe("ala7");
  });

  it("makes Łukasz and Lukasz collide, as well as ala_7, ala-7 and ala7", () => {
    expect(normalizeDisplayName("Łukasz")).toBe(normalizeDisplayName("Lukasz"));
    expect(normalizeDisplayName("ala_7")).toBe(normalizeDisplayName("ala-7"));
    expect(normalizeDisplayName("ala-7")).toBe(normalizeDisplayName("ala7"));
  });
});
