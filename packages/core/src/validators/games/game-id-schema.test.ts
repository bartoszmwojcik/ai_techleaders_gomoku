import { describe, expect, it } from "vitest";

import { gameIdSchema } from "./game-id-schema";

describe("gameIdSchema", () => {
  it("accepts a uuid", () => {
    expect(gameIdSchema.safeParse("4d293981-7b3c-4f81-a1af-0a9e3bf3636b").success).toBe(true);
  });

  it.each(["", "abc", "4d293981-7b3c-4f81-a1af-0a9e3bf3636", "../etc", "1; drop table games"])(
    "rejects %j",
    (value) => {
      expect(gameIdSchema.safeParse(value).success).toBe(false);
    },
  );
});
