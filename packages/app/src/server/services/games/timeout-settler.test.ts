import { describe, expect, it } from "vitest";

import { NoopTimeoutSettler } from "./timeout-settler";

describe("NoopTimeoutSettler", () => {
  it("settles nothing until the clock exists", async () => {
    expect(await new NoopTimeoutSettler().settleFor("user-1")).toBeUndefined();
  });
});
