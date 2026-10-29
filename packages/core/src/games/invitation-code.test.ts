import { describe, expect, it } from "vitest";

import { INVITATION_CODE_ALPHABET, INVITATION_CODE_LENGTH } from "./constants";
import {
  formatInvitationCode,
  generateInvitationCode,
  invitationUrl,
  normalizeInvitationCode,
} from "./invitation-code";

describe("invitation alphabet", () => {
  it("has 31 distinct symbols without look-alikes", () => {
    expect(INVITATION_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(INVITATION_CODE_ALPHABET).size).toBe(31);
    for (const banned of "01OIL") {
      expect(INVITATION_CODE_ALPHABET).not.toContain(banned);
    }
  });
});

describe("generateInvitationCode", () => {
  it("draws every symbol from the injected source over the whole alphabet", () => {
    const calls: number[] = [];
    let next = 0;
    const code = generateInvitationCode((max) => {
      calls.push(max);
      return next++;
    });
    expect(code).toBe(INVITATION_CODE_ALPHABET.slice(0, INVITATION_CODE_LENGTH));
    expect(calls).toEqual(Array(INVITATION_CODE_LENGTH).fill(31));
  });

  it("can reach the last symbol", () => {
    const code = generateInvitationCode(() => 30);
    expect(code).toBe("Z".repeat(INVITATION_CODE_LENGTH));
  });
});

describe("formatInvitationCode", () => {
  it("groups the code as ABCD-EFGH", () => {
    expect(formatInvitationCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });
});

describe("normalizeInvitationCode", () => {
  it("accepts any case, dash and spaces", () => {
    expect(normalizeInvitationCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeInvitationCode(" ab cd efgh ")).toBe("ABCDEFGH");
    expect(normalizeInvitationCode("ABCDEFGH")).toBe("ABCDEFGH");
  });

  it("rejects a wrong length", () => {
    expect(normalizeInvitationCode("ABCDEFG")).toBeNull();
    expect(normalizeInvitationCode("ABCDEFGHJ")).toBeNull();
    expect(normalizeInvitationCode("")).toBeNull();
  });

  it("rejects symbols outside the alphabet", () => {
    expect(normalizeInvitationCode("ABCDEFG0")).toBeNull();
    expect(normalizeInvitationCode("ABCDEFGL")).toBeNull();
    expect(normalizeInvitationCode("ABCD*FGH")).toBeNull();
  });
});

describe("invitationUrl", () => {
  it("points at /invite with the grouped code", () => {
    expect(invitationUrl("https://gomoku.test", "ABCDEFGH")).toBe(
      "https://gomoku.test/invite/ABCD-EFGH",
    );
  });
});
