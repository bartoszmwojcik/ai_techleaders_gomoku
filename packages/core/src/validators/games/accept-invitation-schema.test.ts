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
});
