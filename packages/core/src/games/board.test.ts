import { describe, expect, it } from "vitest";

import {
  BITBOARD_BYTES,
  BOARD_CELLS,
  assertBoardConsistent,
  cellOf,
  coordsOf,
  countStones,
  createBitboard,
  hasStone,
  isCell,
  withStone,
} from "./board";

function boardOf(cells: number[]) {
  return cells.reduce(withStone, createBitboard());
}

describe("board geometry", () => {
  it("has 225 cells in 29 bytes", () => {
    expect(BOARD_CELLS).toBe(225);
    expect(BITBOARD_BYTES).toBe(29);
    expect(createBitboard()).toHaveLength(29);
  });

  it("maps coordinates to cells and back, corners included", () => {
    expect(cellOf(0, 0)).toBe(0);
    expect(cellOf(14, 0)).toBe(14);
    expect(cellOf(0, 1)).toBe(15);
    expect(cellOf(14, 14)).toBe(224);
    expect(coordsOf(224)).toEqual({ x: 14, y: 14 });
    expect(coordsOf(15)).toEqual({ x: 0, y: 1 });
    expect(coordsOf(cellOf(3, 9))).toEqual({ x: 3, y: 9 });
  });

  it("recognises cells of the board", () => {
    expect(isCell(0)).toBe(true);
    expect(isCell(224)).toBe(true);
    expect(isCell(225)).toBe(false);
    expect(isCell(-1)).toBe(false);
    expect(isCell(1.5)).toBe(false);
  });
});

describe("bitboard", () => {
  it("sets and reads bits across byte boundaries", () => {
    for (const cell of [0, 7, 8, 15, 224]) {
      const board = withStone(createBitboard(), cell);
      expect(hasStone(board, cell)).toBe(true);
      expect(countStones(board)).toBe(1);
      expect(hasStone(board, cell === 0 ? 1 : cell - 1)).toBe(false);
    }
  });

  it("does not mutate its input", () => {
    const empty = createBitboard();
    withStone(empty, 5);
    expect(countStones(empty)).toBe(0);
  });

  it("counts stones", () => {
    expect(countStones(boardOf([1, 2, 3, 100, 224]))).toBe(5);
  });
});

describe("assertBoardConsistent", () => {
  it("accepts an empty board and a valid position", () => {
    const empty = createBitboard();
    expect(() => assertBoardConsistent({ black: empty, white: empty, moves: [] })).not.toThrow();
    expect(() =>
      assertBoardConsistent({ black: boardOf([10, 12]), white: boardOf([11]), moves: [10, 11, 12] }),
    ).not.toThrow();
  });

  it("rejects a stone count that differs from the move log", () => {
    expect(() =>
      assertBoardConsistent({ black: boardOf([10]), white: createBitboard(), moves: [] }),
    ).toThrow(/number of moves/);
  });

  it("rejects stones that do not alternate", () => {
    expect(() =>
      assertBoardConsistent({ black: boardOf([1, 2]), white: createBitboard(), moves: [1, 2] }),
    ).toThrow(/alternate/);
  });

  it("rejects a log with a repeated or foreign cell", () => {
    const empty = createBitboard();
    expect(() =>
      assertBoardConsistent({ black: boardOf([5, 7]), white: boardOf([6]), moves: [5, 6, 5] }),
    ).toThrow(/repeats/);
    expect(() =>
      assertBoardConsistent({ black: boardOf([5]), white: empty, moves: [300] }),
    ).toThrow(/repeats/);
  });

  it("rejects a log that disagrees with the colours", () => {
    expect(() =>
      assertBoardConsistent({ black: boardOf([1]), white: boardOf([2]), moves: [2, 1] }),
    ).toThrow(/disagrees/);
    expect(() =>
      assertBoardConsistent({ black: boardOf([1, 3]), white: boardOf([2]), moves: [1, 2, 4] }),
    ).toThrow(/disagrees/);
  });
});
