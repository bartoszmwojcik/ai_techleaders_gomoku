import { describe, expect, it } from "vitest";

import { agentGetStateSchema, agentPlayMoveSchema } from "./agent-tool-schema";

const token = "a".repeat(43);

const fieldOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("agentGetStateSchema", () => {
  it("accepts a token alone and with the optional fields", () => {
    expect(agentGetStateSchema.safeParse({ token }).success).toBe(true);
    expect(agentGetStateSchema.safeParse({ token, waitSeconds: 25, afterMove: 225 }).success).toBe(true);
    expect(agentGetStateSchema.safeParse({ token, waitSeconds: null, afterMove: null }).success).toBe(true);
  });

  it.each([
    [{}, "token"],
    [{ token: "short" }, "token"],
    [{ token: `${"a".repeat(42)}=` }, "token"],
    [{ token: 5 }, "token"],
    [{ token, waitSeconds: 26 }, "waitSeconds"],
    [{ token, waitSeconds: -1 }, "waitSeconds"],
    [{ token, waitSeconds: 1.5 }, "waitSeconds"],
    [{ token, waitSeconds: "5" }, "waitSeconds"],
    [{ token, afterMove: -1 }, "afterMove"],
    [{ token, afterMove: 226 }, "afterMove"],
  ])("rejects %j naming the field %s and nothing else", (value, field) => {
    const result = agentGetStateSchema.safeParse(value);

    expect(result.success).toBe(false);
    expect(fieldOf(result)).toBe(field);
  });
});

describe("agentPlayMoveSchema", () => {
  it("accepts any integer coordinate: the board range is a rule of the game, not of the shape", () => {
    expect(agentPlayMoveSchema.safeParse({ token, x: 7, y: 7, moveNumber: 1 }).success).toBe(true);
    expect(agentPlayMoveSchema.safeParse({ token, x: -3, y: 99, moveNumber: 225 }).success).toBe(true);
  });

  it.each([
    [{ token, y: 1, moveNumber: 1 }, "x"],
    [{ token, x: 1.5, y: 1, moveNumber: 1 }, "x"],
    [{ token, x: "1", y: 1, moveNumber: 1 }, "x"],
    [{ token, x: 1, y: null, moveNumber: 1 }, "y"],
    [{ token, x: 1, y: 1, moveNumber: 0 }, "moveNumber"],
    [{ token, x: 1, y: 1, moveNumber: 226 }, "moveNumber"],
    [{ token, x: 1, y: 1 }, "moveNumber"],
    [{ x: 1, y: 1, moveNumber: 1 }, "token"],
  ])("rejects %j naming the field %s", (value, field) => {
    const result = agentPlayMoveSchema.safeParse(value);

    expect(result.success).toBe(false);
    expect(fieldOf(result)).toBe(field);
  });
});
