import { describe, expect, it } from "vitest";

import { createAccountGameSchema, createGuestGameSchema } from "./create-game-schema";
import {
  TIME_CONTROL_WITH_CLASSIC_MESSAGE,
  createGameSettingsSchema,
  resolveGameSettings,
} from "./create-game-settings-schema";

describe("createGameSettingsSchema", () => {
  it("accepts no settings, the paper game with or without a time, and the classic game", () => {
    expect(createGameSettingsSchema.parse({})).toEqual({});
    expect(createGameSettingsSchema.parse({ variant: "classic" })).toEqual({ variant: "classic" });
    expect(createGameSettingsSchema.parse({ variant: "paper" })).toEqual({ variant: "paper" });
    for (const timeControlMs of [60_000, 120_000, 180_000, 300_000]) {
      expect(createGameSettingsSchema.parse({ variant: "paper", timeControlMs })).toEqual({ variant: "paper", timeControlMs });
    }
  });

  it("refuses a time for the classic game, explicit or implied", () => {
    for (const input of [{ timeControlMs: 60_000 }, { variant: "classic", timeControlMs: 60_000 }]) {
      const result = createGameSettingsSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]).toMatchObject({ path: ["timeControlMs"], message: TIME_CONTROL_WITH_CLASSIC_MESSAGE });
      }
    }
  });

  it.each([{ variant: "renju" }, { variant: "paper", timeControlMs: 90_000 }, { variant: "paper", timeControlMs: "60000" }])(
    "rejects %j",
    (input) => {
      expect(createGameSettingsSchema.safeParse(input).success).toBe(false);
    },
  );

  it("is part of the account and guest inputs", () => {
    expect(createAccountGameSchema.parse({ variant: "paper", timeControlMs: 60_000 })).toEqual({ variant: "paper", timeControlMs: 60_000 });
    expect(createAccountGameSchema.safeParse({ timeControlMs: 60_000 }).success).toBe(false);
    const guest = { acknowledgedGuestWarning: true, variant: "paper", timeControlMs: 300_000 };
    expect(createGuestGameSchema.parse(guest)).toEqual(guest);
    expect(createGuestGameSchema.safeParse({ acknowledgedGuestWarning: true, timeControlMs: 300_000 }).success).toBe(false);
  });
});

describe("resolveGameSettings", () => {
  it("defaults to the classic game with ten minutes", () => {
    expect(resolveGameSettings()).toEqual({ variant: "classic", timeControlMs: 600_000 });
    expect(resolveGameSettings({})).toEqual({ variant: "classic", timeControlMs: 600_000 });
  });

  it("defaults the paper game to three minutes and keeps a chosen time", () => {
    expect(resolveGameSettings({ variant: "paper" })).toEqual({ variant: "paper", timeControlMs: 180_000 });
    expect(resolveGameSettings({ variant: "paper", timeControlMs: 60_000 })).toEqual({ variant: "paper", timeControlMs: 60_000 });
  });
});
