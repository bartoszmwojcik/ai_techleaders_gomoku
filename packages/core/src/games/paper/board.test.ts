import { describe, expect, it } from "vitest";

import { cellKey, indexStones, isAllowed, isOnBoard, refusal, refusalIn, type PaperStone } from "./board";

const stone = (x: number, y: number, seat: 1 | 2 = 1): PaperStone => ({ x, y, seat, auto: false });

describe("paper board", () => {
  it("knows the sheet's edges", () => {
    expect(isOnBoard(0, 0)).toBe(true);
    expect(isOnBoard(100, 100)).toBe(true);
    expect(isOnBoard(-1, 0)).toBe(false);
    expect(isOnBoard(0, 101)).toBe(false);
    expect(isOnBoard(1.5, 0)).toBe(false);
    expect(cellKey(2, 1)).toBe(103);
  });

  it("allows only the middle as the first stone", () => {
    expect(isAllowed([], 50, 50)).toBe(true);
    expect(refusal([], 49, 50)).toBe("FIRST_MOVE_CENTER");
    expect(refusal([], 50, 49)).toBe("FIRST_MOVE_CENTER");
    expect(refusal([], 200, 0)).toBe("OFF_BOARD");
  });

  it("allows cells up to three away from a stone, in every direction", () => {
    const stones = [stone(50, 50)];
    for (const [x, y] of [[53, 50], [47, 50], [50, 53], [50, 47], [53, 53], [47, 47], [53, 47], [47, 53]] as const) {
      expect(isAllowed(stones, x, y)).toBe(true);
    }
    for (const [x, y] of [[54, 50], [46, 50], [50, 54], [50, 46], [54, 54], [54, 53]] as const) {
      expect(refusal(stones, x, y)).toBe("MOVE_TOO_FAR");
    }
  });

  it("refuses an occupied cell and counts any stone, of either player", () => {
    const stones = [stone(50, 50), stone(51, 50, 2), stone(60, 60, 2)];
    expect(refusal(stones, 50, 50)).toBe("CELL_OCCUPIED");
    expect(isAllowed(stones, 63, 63)).toBe(true);
    expect(isAllowed(stones, 64, 64)).toBe(false);
  });

  it("does not wrap around the edge of the sheet", () => {
    const stones = [stone(100, 10)];
    expect(refusalIn(indexStones(stones), 0, 11)).toBe("MOVE_TOO_FAR");
    expect(refusalIn(indexStones([stone(0, 11)]), 100, 10)).toBe("MOVE_TOO_FAR");
    expect(refusalIn(indexStones(stones), 101, 10)).toBe("OFF_BOARD");
  });
});
