import { describe, expect, it } from "vitest";

import {
  RESET_LINK_VALID_HOURS,
  buildResetLink,
  buildResetMessage,
} from "./password-reset-message";

const base = {
  to: "ala@example.com",
  name: "Ala",
  token: "abc_DEF-123",
  origin: "https://gomoku.example",
};

describe("buildResetLink", () => {
  it("builds the link from the origin and trims trailing slashes", () => {
    expect(buildResetLink(base)).toBe(
      "https://gomoku.example/reset-password?token=abc_DEF-123",
    );
    expect(buildResetLink({ ...base, origin: "http://localhost:3000/" })).toBe(
      "http://localhost:3000/reset-password?token=abc_DEF-123",
    );
  });

  it("encodes the token", () => {
    expect(buildResetLink({ ...base, token: "a+b/c=&d" })).toBe(
      `https://gomoku.example/reset-password?token=${encodeURIComponent("a+b/c=&d")}`,
    );
  });
});

describe("buildResetMessage", () => {
  it("returns recipient, fixed Polish subject and both bodies with the link", () => {
    const message = buildResetMessage(base);
    expect(message.to).toBe("ala@example.com");
    expect(message.subject).toBe("Reset hasła w Gomoku");
    expect(message.text).toContain("Cześć Ala,");
    expect(message.text).toContain(
      "https://gomoku.example/reset-password?token=abc_DEF-123",
    );
    expect(message.html).toContain(
      '<a href="https://gomoku.example/reset-password?token=abc_DEF-123">Ustaw nowe hasło</a>',
    );
  });

  it("states the one hour validity and tells to ignore an unwanted message", () => {
    expect(RESET_LINK_VALID_HOURS).toBe(1);
    const { text, html } = buildResetMessage(base);
    for (const body of [text, html]) {
      expect(body).toContain("Link jest ważny 1 godzinę i działa tylko raz.");
      expect(body).toContain(
        "Jeśli to nie Ty prosiłeś o reset, zignoruj tę wiadomość",
      );
    }
  });

  it("escapes the player name and the link in html but not the name in text", () => {
    const message = buildResetMessage({
      ...base,
      name: "<script>alert(1)</script>",
      token: 'a"b',
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.text).toContain("<script>alert(1)</script>");
  });
});
