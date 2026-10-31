import { describe, expect, it } from "vitest";

import { seekerIdSchema } from "./seeker-id-schema";

describe("seekerIdSchema", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(seekerIdSchema.safeParse("4d293981-7b3c-4f81-a1af-0a9e3bf3636b").success).toBe(true);
    expect(seekerIdSchema.safeParse("nope").success).toBe(false);
  });
});
