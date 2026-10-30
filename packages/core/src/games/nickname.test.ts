import { describe, expect, it } from "vitest";

import {
  NICKNAME_MAX_LENGTH,
  defaultNickname,
  nicknameSchema,
  normalizeNickname,
} from "./nickname";

const parse = (value: unknown) => nicknameSchema.safeParse(value);

describe("normalizeNickname", () => {
  it("composes to NFC", () => {
    expect(normalizeNickname("é")).toBe("é");
  });

  it("turns tabs and newlines into spaces and collapses them", () => {
    expect(normalizeNickname("a\tb\nc")).toBe("a b c");
  });

  it("collapses NBSP and other space separators, and trims", () => {
    expect(normalizeNickname("  a  b 　")).toBe("a b");
  });

  it("drops bidi overrides and zero-width characters but keeps ZWNJ and ZWJ", () => {
    expect(normalizeNickname("a‮b​c﻿d")).toBe("abcd");
    expect(normalizeNickname("a‌b‍c")).toBe("a‌b‍c");
  });

  it("returns an empty string for spaces only", () => {
    expect(normalizeNickname("     ")).toBe("");
  });
});

describe("nicknameSchema", () => {
  it("accepts letters, digits, spaces, underscore and hyphen", () => {
    expect(parse("Ala_ma-kota 42").data).toBe("Ala_ma-kota 42");
    expect(parse("Zażółć gęślą").data).toBe("Zażółć gęślą");
  });

  it("returns the normalized value", () => {
    expect(parse("  Ala  Ola\t").data).toBe("Ala Ola");
  });

  it("treats an empty result as no nickname", () => {
    for (const value of ["", "   ", " \t‮​"]) {
      const result = parse(value);
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    }
  });

  it("accepts exactly 24 characters and rejects 25", () => {
    expect(parse("a".repeat(NICKNAME_MAX_LENGTH)).success).toBe(true);
    const result = parse("a".repeat(NICKNAME_MAX_LENGTH + 1));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("24");
  });

  it("counts code points, not UTF-16 units (astral letters)", () => {
    const wide = "\u{20BB7}"; // CJK Extension B, outside the BMP
    expect(wide.length).toBe(2);
    expect(parse(wide.repeat(24)).success).toBe(true);
    expect(parse(wide.repeat(25)).success).toBe(false);
    expect(parse("\u{1D7D8}".repeat(24)).success).toBe(true); // astral digit
  });

  it("accepts combining marks and the joiners of non-Latin scripts", () => {
    expect(parse("ä́").success).toBe(true);
    expect(parse("क्‍ष").data).toBe("क्‍ष");
  });

  it("rejects markup and symbols", () => {
    for (const value of ["<b>x</b>", "a;b", "a@b", "ok\u{1F600}", "a.b", "a/b"]) {
      const result = parse(value);
      expect(result.success, value).toBe(false);
      expect(result.error?.issues[0]?.message).toContain("litery");
    }
  });

  it("rejects values that are not strings", () => {
    expect(parse(5).success).toBe(false);
    expect(parse(null).success).toBe(false);
  });

  it("compiles its pattern with the u flag (property escapes work on astral letters)", () => {
    expect(parse("\u{10400}").success).toBe(true); // Deseret capital letter
  });
});

describe("defaultNickname", () => {
  it("is derived from the seat", () => {
    expect(defaultNickname(1)).toBe("Gracz 1");
    expect(defaultNickname(2)).toBe("Gracz 2");
  });
});
