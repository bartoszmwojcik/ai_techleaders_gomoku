import type { EntityManager } from "@gomoku/db";
import { describe, expect, it } from "vitest";

import { NoopTimeoutSettler } from "./timeout-settler";

describe("NoopTimeoutSettler", () => {
  it("settles nothing until the clock exists", async () => {
    const settler = new NoopTimeoutSettler();
    expect(await settler.settleFor("user-1")).toBeUndefined();
    expect(await settler.settleGame("game-1", {} as EntityManager)).toBe(false);
  });
});
