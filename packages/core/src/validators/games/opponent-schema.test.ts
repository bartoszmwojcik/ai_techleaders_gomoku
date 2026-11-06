import { describe, expect, it } from "vitest";

import { createAccountGameSchema, createGuestGameSchema } from "./create-game-schema";
import {
  BOT_LEVEL_REQUIRED_MESSAGE,
  BOT_LEVEL_WITHOUT_BOT_MESSAGE,
  BOT_PUBLIC_MESSAGE,
  BOT_VARIANT_UNSUPPORTED_MESSAGE,
  resolveOpponent,
} from "./opponent-schema";

const guest = { acknowledgedGuestWarning: true };

/** The issues of a refused input as `path: message`. */
function issuesOf(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  expect(result.success).toBe(false);
  return result.error!.issues.map(({ path, message }) => `${path.join(".")}: ${message}`);
}

describe("opponent of a new game (spec 2026-11-05-hosted-bot)", () => {
  it.each([createAccountGameSchema, { parse: (body: object) => createGuestGameSchema.parse({ ...guest, ...body }) }])(
    "accepts a person by default and the bot with a level",
    (schema) => {
      expect(schema.parse({})).not.toHaveProperty("opponent");
      expect(schema.parse({ opponent: "human" })).toMatchObject({ opponent: "human" });
      expect(schema.parse({ opponent: "bot", botLevel: 1 })).toMatchObject({ opponent: "bot", botLevel: 1 });
      expect(schema.parse({ opponent: "bot", botLevel: 2, variant: "classic", isPublic: false })).toMatchObject({ botLevel: 2 });
    },
  );

  it("requires the level for the bot and refuses it for a person", () => {
    expect(issuesOf(createAccountGameSchema.safeParse({ opponent: "bot" }))).toEqual([`botLevel: ${BOT_LEVEL_REQUIRED_MESSAGE}`]);
    expect(issuesOf(createAccountGameSchema.safeParse({ botLevel: 2 }))).toEqual([`botLevel: ${BOT_LEVEL_WITHOUT_BOT_MESSAGE}`]);
    expect(issuesOf(createGuestGameSchema.safeParse({ ...guest, opponent: "human", botLevel: 1 }))).toEqual([
      `botLevel: ${BOT_LEVEL_WITHOUT_BOT_MESSAGE}`,
    ]);
  });

  it("refuses the bot in the paper game, in a public game and with a clock (BR-56, R14)", () => {
    expect(issuesOf(createAccountGameSchema.safeParse({ opponent: "bot", botLevel: 1, variant: "paper" }))).toEqual([
      `opponent: ${BOT_VARIANT_UNSUPPORTED_MESSAGE}`,
    ]);
    expect(issuesOf(createGuestGameSchema.safeParse({ ...guest, opponent: "bot", botLevel: 2, isPublic: true }))).toEqual([
      `isPublic: ${BOT_PUBLIC_MESSAGE}`,
    ]);
    expect(issuesOf(createAccountGameSchema.safeParse({ opponent: "bot", botLevel: 1, timeControlMs: 60_000 }))).toHaveLength(1);
  });

  it("refuses an unknown opponent and level", () => {
    expect(createAccountGameSchema.safeParse({ opponent: "cpu" }).success).toBe(false);
    expect(createAccountGameSchema.safeParse({ opponent: "bot", botLevel: 3 }).success).toBe(false);
    expect(createAccountGameSchema.safeParse({ opponent: "bot", botLevel: "1" }).success).toBe(false);
  });

  it("resolves the choice", () => {
    expect(resolveOpponent({})).toEqual({ kind: "human" });
    expect(resolveOpponent({ opponent: "human" })).toEqual({ kind: "human" });
    expect(resolveOpponent({ opponent: "bot", botLevel: 2 })).toEqual({ kind: "bot", level: 2 });
    expect(resolveOpponent({ opponent: "bot" })).toEqual({ kind: "bot", level: 1 });
  });
});
