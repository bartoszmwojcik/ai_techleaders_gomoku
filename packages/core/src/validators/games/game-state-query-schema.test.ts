import { describe, expect, it } from "vitest";

import { classicGameStateQuerySchema, gameStateQuerySchema } from "./game-state-query-schema";

describe("classicGameStateQuerySchema", () => {
  it("defaults `after` to 0 and parses a number", () => {
    expect(classicGameStateQuerySchema.parse({})).toEqual({ after: 0 });
    expect(classicGameStateQuerySchema.parse({ after: "17" })).toEqual({ after: 17 });
    expect(classicGameStateQuerySchema.parse({ after: "225" })).toEqual({ after: 225 });
  });

  it.each(["-1", "1.5", "abc", "", "226", "1000", "0x10"])("rejects after=%j", (after) => {
    expect(classicGameStateQuerySchema.safeParse({ after }).success).toBe(false);
  });
});

describe("gameStateQuerySchema (widest sheet)", () => {
  it("accepts `after` up to 10201", () => {
    expect(gameStateQuerySchema.parse({ after: "226" })).toEqual({ after: 226 });
    expect(gameStateQuerySchema.parse({ after: "10201" })).toEqual({ after: 10201 });
    expect(gameStateQuerySchema.parse({})).toEqual({ after: 0 });
  });

  it.each(["10202", "99999", "100000", "-1", "x"])("rejects after=%j", (after) => {
    expect(gameStateQuerySchema.safeParse({ after }).success).toBe(false);
  });
});
