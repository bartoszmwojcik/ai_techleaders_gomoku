import { describe, expect, it } from "vitest";

import { GameParticipation } from "./game-participation";

describe("GameParticipation", () => {
  it("reports no active game until games exist", async () => {
    expect(await new GameParticipation().hasActiveGame("user-1")).toBe(false);
  });
});
