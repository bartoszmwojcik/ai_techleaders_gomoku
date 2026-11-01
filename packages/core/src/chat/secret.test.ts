import { describe, expect, it } from "vitest";

import { looksLikeSecret } from "./secret";

const token = "Ab3_-".repeat(8) + "Ab3";

describe("looksLikeSecret", () => {
  it("catches the token alone, inside a sentence and a short custom token", () => {
    expect(looksLikeSecret(token, token)).toBe(true);
    expect(looksLikeSecret(`oto ${token}!`, token)).toBe(true);
    expect(looksLikeSecret("my abc token", "abc")).toBe(true);
  });

  it("catches any run of 32 token characters, not 31", () => {
    expect(looksLikeSecret("x".repeat(32), token)).toBe(true);
    expect(looksLikeSecret("x".repeat(31), token)).toBe(false);
    expect(looksLikeSecret(`a ${"-_".repeat(16)} b`, token)).toBe(true);
  });

  it("lets ordinary text through: letters with diacritics, spaces, long sentences", () => {
    expect(looksLikeSecret("Dobra gra, zagraj spokojniej żółć", token)).toBe(false);
    expect(looksLikeSecret("a ".repeat(60), token)).toBe(false);
    expect(looksLikeSecret("zażółćgęśląjaźńzażółćgęśląjaźńzażółć", token)).toBe(false);
  });

  it("ignores an empty token", () => {
    expect(looksLikeSecret("hej", "")).toBe(false);
  });
});
