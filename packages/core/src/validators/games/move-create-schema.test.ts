import { describe, expect, it } from "vitest";

import { classicMoveCreateSchema, moveCreateSchema } from "./move-create-schema";

describe("classicMoveCreateSchema", () => {
  it("accepts the corners and the first and last move number", () => {
    expect(classicMoveCreateSchema.parse({ x: 0, y: 0, moveNumber: 1 })).toEqual({ x: 0, y: 0, moveNumber: 1 });
    expect(classicMoveCreateSchema.parse({ x: 14, y: 14, moveNumber: 225 })).toEqual({ x: 14, y: 14, moveNumber: 225 });
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
    expect(classicMoveCreateSchema.safeParse(input).success).toBe(false);
  });

  it("reports which field is wrong", () => {
    const result = classicMoveCreateSchema.safeParse({ x: 99, y: "a", moveNumber: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0]).sort()).toEqual(["moveNumber", "x", "y"]);
    }
  });
});

describe("moveCreateSchema (widest sheet)", () => {
  it("accepts coordinates 0–100 and move numbers up to 10201", () => {
    expect(moveCreateSchema.parse({ x: 100, y: 100, moveNumber: 10201 })).toEqual({ x: 100, y: 100, moveNumber: 10201 });
    expect(moveCreateSchema.parse({ x: 50, y: 0, moveNumber: 1 })).toEqual({ x: 50, y: 0, moveNumber: 1 });
  });

  it.each([[{ x: 101, y: 0, moveNumber: 1 }], [{ x: 0, y: -1, moveNumber: 1 }], [{ x: 0, y: 0, moveNumber: 10202 }], [{ x: 0, y: 0, moveNumber: 0 }]])(
    "rejects %j",
    (input) => {
      expect(moveCreateSchema.safeParse(input).success).toBe(false);
    },
  );
});
