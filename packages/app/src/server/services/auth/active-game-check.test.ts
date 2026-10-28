import { describe, expect, it } from "vitest";

import { ActiveGameCheck } from "./active-game-check";

describe("ActiveGameCheck", () => {
  it("reports no active game until games exist", async () => {
    expect(await new ActiveGameCheck().hasActiveGame("user-1")).toBe(false);
  });
});
