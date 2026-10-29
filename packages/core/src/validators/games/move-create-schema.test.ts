import { describe, expect, it } from "vitest";

import { moveCreateSchema } from "./move-create-schema";

describe("moveCreateSchema", () => {
  it("accepts the corners and the first and last move number", () => {
    expect(moveCreateSchema.parse({ x: 0, y: 0, moveNumber: 1 })).toEqual({ x: 0, y: 0, moveNumber: 1 });
    expect(moveCreateSchema.parse({ x: 14, y: 14, moveNumber: 225 })).toEqual({ x: 14, y: 14, moveNumber: 225 });
  });

  it.each([
    [{ x: -1, y: 0, moveNumber: 1 }],
    [{ x: 15, y: 0, moveNumber: 1 }],
    [{ x: 0, y: 15, moveNumber: 1 }],
    [{ x: 0.5, y: 0, moveNumber: 1 }],
    [{ x: "1", y: 0, moveNumber: 1 }],
    [{ x: 0, y: 0, moveNumber: 0 }],
    [{ x: 0, y: 0, moveNumber: 226 }],
    [{ x: 0, y: 0, moveNumber: 1.5 }],
    [{ x: 0, y: 0 }],
    [{ y: 0, moveNumber: 1 }],
    [{}],
  ])("rejects %j", (input) => {
    expect(moveCreateSchema.safeParse(input).success).toBe(false);
  });

  it("reports which field is wrong", () => {
    const result = moveCreateSchema.safeParse({ x: 99, y: "a", moveNumber: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0]).sort()).toEqual(["moveNumber", "x", "y"]);
    }
  });
});
