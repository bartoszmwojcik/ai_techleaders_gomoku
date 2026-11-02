import { describe, expect, it } from "vitest";

import {
  buildEmailChangeLink,
  buildEmailChangeMessage,
  buildEmailChangedNotice,
  maskEmail,
} from "./email-change-message";

describe("buildEmailChangeMessage", () => {
  const message = buildEmailChangeMessage({ to: "nowy@example.com", name: "<Ala>", token: "a/b+c", origin: "https://gomoku.example/" });

  it("goes to the new address with a link carrying the encoded token", () => {
    expect(message.to).toBe("nowy@example.com");
    expect(buildEmailChangeLink({ origin: "https://gomoku.example///", token: "a/b+c" })).toBe(
      "https://gomoku.example/confirm-email-change?token=a%2Fb%2Bc",
    );
    expect(message.text).toContain("https://gomoku.example/confirm-email-change?token=a%2Fb%2Bc");
    expect(message.text).toContain("24 godziny");
  });

  it("escapes the name in the HTML body", () => {
    expect(message.html).toContain("&lt;Ala&gt;");
    expect(message.html).not.toContain("<Ala>");
  });
});

describe("buildEmailChangedNotice", () => {
  it("goes to the old address and names only the masked new one", () => {
    const notice = buildEmailChangedNotice({ to: "stary@example.com", name: "Ala", newEmailMasked: "n***@example.com" });
    expect(notice.to).toBe("stary@example.com");
    expect(notice.text).toContain("n***@example.com");
    expect(notice.html).toContain("n***@example.com");
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("ala.kowalska@example.com")).toBe("a***@example.com");
  });

  it("hides a string that is not an address", () => {
    expect(maskEmail("bezmalpy")).toBe("***");
    expect(maskEmail("@x.pl")).toBe("***");
  });
});
