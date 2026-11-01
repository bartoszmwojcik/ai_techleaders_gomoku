import { describe, expect, it } from "vitest";

import { chatReadQuerySchema } from "./chat-read-query-schema";

describe("chatReadQuerySchema", () => {
  it("defaults the limit to 50 and leaves the cursor out", () => {
    expect(chatReadQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("parses the cursor and the limit", () => {
    expect(chatReadQuerySchema.parse({ after_id: "0", limit: "1" })).toEqual({ after_id: 0, limit: 1 });
    expect(chatReadQuerySchema.parse({ after_id: "2147483647", limit: "100" })).toEqual({
      after_id: 2147483647,
      limit: 100,
    });
  });

  it.each([
    { after_id: "-1" },
    { after_id: "1.5" },
    { after_id: "abc" },
    { after_id: "" },
    { after_id: "2147483648" },
    { after_id: "99999999999" },
    { limit: "0" },
    { limit: "101" },
    { limit: "x" },
  ])("rejects %j", (query) => {
    expect(chatReadQuerySchema.safeParse(query).success).toBe(false);
  });
});
