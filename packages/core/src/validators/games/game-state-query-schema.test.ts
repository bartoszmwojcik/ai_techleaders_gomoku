import { describe, expect, it } from "vitest";

import { gameStateQuerySchema } from "./game-state-query-schema";

describe("gameStateQuerySchema", () => {
  it("defaults `after` to 0 and parses a number", () => {
    expect(gameStateQuerySchema.parse({})).toEqual({ after: 0 });
    expect(gameStateQuerySchema.parse({ after: "17" })).toEqual({ after: 17 });
    expect(gameStateQuerySchema.parse({ after: "225" })).toEqual({ after: 225 });
  });

  it.each(["-1", "1.5", "abc", "", "226", "1000", "0x10"])("rejects after=%j", (after) => {
    expect(gameStateQuerySchema.safeParse({ after }).success).toBe(false);
  });
});
