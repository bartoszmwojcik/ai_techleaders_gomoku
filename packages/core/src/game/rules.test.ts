import { describe, expect, it } from "vitest";

import { BOARD_SIZE, WIN_LENGTH } from "./rules";

describe("game rules", () => {
  it("uses a 15×15 board with five in a row to win (freestyle gomoku)", () => {
    expect(BOARD_SIZE).toBe(15);
    expect(WIN_LENGTH).toBe(5);
  });
});
