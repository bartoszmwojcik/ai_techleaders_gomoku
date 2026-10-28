import { describe, expect, it } from "vitest";

import {
  buildVerificationLink,
  buildVerificationMessage,
  escapeHtml,
} from "./email-verification-message";

const base = {
  to: "ala@example.com",
  name: "Ala",
  token: "abc_DEF-123",
  origin: "https://gomoku.example",
};

describe("buildVerificationLink", () => {
  it("builds a link from the origin without next", () => {
    expect(buildVerificationLink(base)).toBe(
      "https://gomoku.example/verify-email?token=abc_DEF-123",
    );
  });

  it("trims trailing slashes of the origin", () => {
    expect(
      buildVerificationLink({ ...base, origin: "http://localhost:3000/" }),
    ).toBe("http://localhost:3000/verify-email?token=abc_DEF-123");
  });

  it("encodes token and next", () => {
    const link = buildVerificationLink({
      ...base,
      token: "a+b/c=&d",
      next: "/game/1?x=a&y=%",
    });
    expect(link).toBe(
      `https://gomoku.example/verify-email?token=${encodeURIComponent("a+b/c=&d")}&next=${encodeURIComponent("/game/1?x=a&y=%")}`,
    );
  });

  it("drops next rejected by safeNextPath", () => {
    expect(buildVerificationLink({ ...base, next: "//evil.com" })).toBe(
      "https://gomoku.example/verify-email?token=abc_DEF-123",
    );
    expect(
      buildVerificationLink({ ...base, next: "https://evil.com" }),
    ).not.toContain("next=");
  });

  it("drops next equal to the fallback", () => {
    expect(buildVerificationLink({ ...base, next: "/" })).not.toContain(
      "next=",
    );
  });

  it("keeps a safe next", () => {
    expect(buildVerificationLink({ ...base, next: "/invite/xyz" })).toBe(
      "https://gomoku.example/verify-email?token=abc_DEF-123&next=%2Finvite%2Fxyz",
    );
  });
});

describe("escapeHtml", () => {
  it("escapes special characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("buildVerificationMessage", () => {
  it("returns recipient, Polish subject and both bodies", () => {
    const message = buildVerificationMessage(base);
    expect(message.to).toBe("ala@example.com");
    expect(message.subject).toBe("Potwierdź adres e-mail w Gomoku");
    expect(message.text).toContain("Cześć Ala,");
    expect(message.text).toContain(
      "https://gomoku.example/verify-email?token=abc_DEF-123",
    );
    expect(message.html).toContain(
      '<a href="https://gomoku.example/verify-email?token=abc_DEF-123">Potwierdź adres e-mail</a>',
    );
  });

  it("explains why, states validity and tells to ignore", () => {
    const { text, html } = buildVerificationMessage(base);
    for (const body of [text, html]) {
      expect(body).toContain(
        "Bez potwierdzonego adresu nie odzyskasz konta, jeśli zapomnisz hasła.",
      );
      expect(body).toContain("Link jest ważny 24 godziny.");
      expect(body).toContain(
        "Jeśli to nie Ty zakładałeś konto w Gomoku, zignoruj tę wiadomość.",
      );
      expect(body).not.toContain("aby zacząć grać");
      expect(body).not.toContain("aby móc grać");
    }
  });

  it("includes next in both bodies when safe and omits it otherwise", () => {
    const withNext = buildVerificationMessage({ ...base, next: "/invite/xyz" });
    expect(withNext.text).toContain("&next=%2Finvite%2Fxyz");
    expect(withNext.html).toContain("&amp;next=%2Finvite%2Fxyz");
    const evil = buildVerificationMessage({ ...base, next: "//evil.com" });
    expect(evil.text).not.toContain("next=");
    expect(evil.html).not.toContain("next=");
  });

  it("escapes the player name in html but not in text", () => {
    const message = buildVerificationMessage({
      ...base,
      name: "<script>alert(1)</script>",
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.text).toContain("<script>alert(1)</script>");
  });
});
