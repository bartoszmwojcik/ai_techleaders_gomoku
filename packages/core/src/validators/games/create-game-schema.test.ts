import { describe, expect, it } from "vitest";

import { createAccountGameSchema, createGuestGameSchema } from "./create-game-schema";

describe("createGuestGameSchema", () => {
  it("accepts the acknowledged warning alone", () => {
    expect(createGuestGameSchema.parse({ acknowledgedGuestWarning: true })).toEqual({ acknowledgedGuestWarning: true });
  });

  it("keeps a normalized nickname and the cancel flag", () => {
    expect(
      createGuestGameSchema.parse({ acknowledgedGuestWarning: true, nickname: "  Ala  ma ", cancelOwnWaitingGame: true }),
    ).toEqual({ acknowledgedGuestWarning: true, nickname: "Ala ma", cancelOwnWaitingGame: true });
  });

  it("treats an empty nickname as none", () => {
    expect(createGuestGameSchema.parse({ acknowledgedGuestWarning: true, nickname: "  " }).nickname).toBeUndefined();
  });

  it.each([{}, { acknowledgedGuestWarning: false }, { nickname: "Ala" }])(
    "rejects %j without the acknowledgement, on that field",
    (body) => {
      const result = createGuestGameSchema.safeParse(body);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["acknowledgedGuestWarning"]);
    },
  );

  it("rejects an invalid nickname, on that field", () => {
    const result = createGuestGameSchema.safeParse({ acknowledgedGuestWarning: true, nickname: "<b>" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["nickname"]);
  });
});

describe("createAccountGameSchema and the guest public flag", () => {
  it("is private unless isPublic is sent", () => {
    expect(createAccountGameSchema.parse({})).toEqual({});
    expect(createAccountGameSchema.parse({ isPublic: true })).toEqual({ isPublic: true });
    expect(createGuestGameSchema.parse({ acknowledgedGuestWarning: true, isPublic: false }).isPublic).toBe(false);
  });

  it("rejects a non-boolean flag", () => {
    expect(createAccountGameSchema.safeParse({ isPublic: "yes" }).success).toBe(false);
    expect(createGuestGameSchema.safeParse({ acknowledgedGuestWarning: true, isPublic: 1 }).success).toBe(false);
  });
});
