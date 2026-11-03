import { describe, expect, it } from "vitest";

import { spectateInvitationSchema } from "./spectate-invitation-schema";

describe("spectateInvitationSchema", () => {
  it("accepts a body without a nickname", () => {
    expect(spectateInvitationSchema.parse({})).toEqual({});
  });

  it("normalizes the nickname and treats an empty one as none", () => {
    expect(spectateInvitationSchema.parse({ nickname: "  Ala   Ma " })).toEqual({ nickname: "Ala Ma" });
    expect(spectateInvitationSchema.parse({ nickname: "   " })).toEqual({});
  });

  it("refuses a nickname that is too long or has forbidden characters", () => {
    expect(spectateInvitationSchema.safeParse({ nickname: "a".repeat(25) }).success).toBe(false);
    expect(spectateInvitationSchema.safeParse({ nickname: "<b>" }).success).toBe(false);
  });
});
