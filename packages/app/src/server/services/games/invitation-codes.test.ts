import { INVITATION_CODE_ALPHABET, normalizeInvitationCode } from "@gomoku/core";
import { describe, expect, it } from "vitest";

import { InvitationCodes } from "./invitation-codes";

describe("InvitationCodes", () => {
  it("generates codes of the invitation alphabet in storage form", () => {
    const codes = new InvitationCodes();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const code = codes.generate();
      expect(code).toHaveLength(8);
      expect([...code].every((s) => INVITATION_CODE_ALPHABET.includes(s))).toBe(true);
      expect(normalizeInvitationCode(code)).toBe(code);
      seen.add(code);
    }
    expect(seen.size).toBe(50);
  });
});
