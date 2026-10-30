import { describe, expect, it } from "vitest";

import { acceptInvitationSchema } from "./accept-invitation-schema";

describe("acceptInvitationSchema", () => {
  it("accepts joining as a user without flags", () => {
    expect(acceptInvitationSchema.parse({ as: "user" })).toEqual({ as: "user" });
  });

  it("keeps the optional cancelOwnWaitingGame flag", () => {
    expect(
      acceptInvitationSchema.parse({ as: "user", cancelOwnWaitingGame: true }),
    ).toEqual({ as: "user", cancelOwnWaitingGame: true });
  });

  it("accepts a guest who acknowledged the warning", () => {
    expect(
      acceptInvitationSchema.safeParse({ as: "guest", acknowledgedGuestWarning: true })
        .success,
    ).toBe(true);
  });

  it("rejects a guest without the acknowledgement, on that field", () => {
    for (const body of [{ as: "guest" }, { as: "guest", acknowledgedGuestWarning: false }]) {
      const result = acceptInvitationSchema.safeParse(body);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["acknowledgedGuestWarning"]);
    }
  });

  it("rejects an unknown or missing mode", () => {
    expect(acceptInvitationSchema.safeParse({ as: "admin" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({}).success).toBe(false);
  });

  it("normalizes a guest nickname and treats an empty one as none", () => {
    const base = { as: "guest", acknowledgedGuestWarning: true } as const;
    expect(acceptInvitationSchema.parse({ ...base, nickname: "  Ala  " }).nickname).toBe("Ala");
    expect(acceptInvitationSchema.parse({ ...base, nickname: "  " }).nickname).toBeUndefined();
  });

  it("rejects an invalid guest nickname on that field", () => {
    const result = acceptInvitationSchema.safeParse({
      as: "guest",
      acknowledgedGuestWarning: true,
      nickname: "<b>",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["nickname"]);
  });

  it("rejects a nickname for a signed-in user, on that field", () => {
    const result = acceptInvitationSchema.safeParse({ as: "user", nickname: "Ala" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["nickname"]);
    expect(acceptInvitationSchema.safeParse({ as: "user", nickname: "  " }).success).toBe(true);
  });
});
