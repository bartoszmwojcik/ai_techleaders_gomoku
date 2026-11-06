import { describe, expect, it } from "vitest";

import { BOARD_CELLS, cellOf, createBitboard, withStone } from "../games/board";
import { BOARD_SIZE, checkWin } from "../games/rules";
import {
  CANDIDATE_RADIUS,
  CELL_WINDOWS,
  CELL_WINDOW_START,
  CENTER,
  EngineBoard,
  WINDOWS,
  WINDOW_COUNT,
  WINDOW_WEIGHTS,
  type Side,
} from "./patterns";
import { createRng } from "./seed";

/** Reference evaluation from scratch: every window, no incremental state. */
function reference(board: EngineBoard): { score: [number, number]; fours: [number, number] } {
  const score: [number, number] = [0, 0];
  const fours: [number, number] = [0, 0];
  for (let window = 0; window < WINDOW_COUNT; window++) {
    const counts = [0, 0];
    for (let step = 0; step < 5; step++) {
      const value = board.cells[WINDOWS[window * 5 + step]!]!;
      if (value !== 0) counts[value - 1]!++;
    }
    for (const side of [0, 1] as const) {
      if (counts[1 - side] === 0) {
        score[side] += WINDOW_WEIGHTS[counts[side]!]!;
        if (counts[side] === 4) fours[side]++;
      }
    }
  }
  return { score, fours };
}

/** A random position without a finished five, built move by move. */
function randomBoard(seed: number, stones: number): EngineBoard {
  const rng = createRng(seed);
  const board = new EngineBoard();
  while (board.stones < stones) {
    const cell = Math.floor(rng() * BOARD_CELLS);
    const side = (board.stones % 2) as Side;
    if (board.cells[cell] !== 0 || board.winsAt(cell, side)) continue;
    board.place(cell, side);
  }
  return board;
}

describe("windows", () => {
  it("are all 572 runs of five cells of the four axes", () => {
    expect(WINDOW_COUNT).toBe(2 * 15 * 11 + 2 * 11 * 11);
    for (let window = 0; window < WINDOW_COUNT; window++) {
      const cells = Array.from(WINDOWS.subarray(window * 5, window * 5 + 5));
      const xs = cells.map((cell) => cell % BOARD_SIZE);
      const ys = cells.map((cell) => Math.floor(cell / BOARD_SIZE));
      const dx = xs[1]! - xs[0]!;
      const dy = ys[1]! - ys[0]!;
      cells.forEach((_, step) => {
        expect(xs[step]).toBe(xs[0]! + dx * step);
        expect(ys[step]).toBe(ys[0]! + dy * step);
      });
    }
  });

  it("index the windows of every cell: 20 at the centre, 3 in a corner", () => {
    const of = (cell: number) => CELL_WINDOW_START[cell + 1]! - CELL_WINDOW_START[cell]!;
    expect(of(CENTER)).toBe(20);
    expect(of(0)).toBe(3);
    for (let index = CELL_WINDOW_START[CENTER]!; index < CELL_WINDOW_START[CENTER + 1]!; index++) {
      expect(WINDOWS.subarray(CELL_WINDOWS[index]! * 5, CELL_WINDOWS[index]! * 5 + 5)).toContain(CENTER);
    }
  });
});

describe("EngineBoard incremental state", () => {
  it("matches a full recount after every move, and a move undone restores everything", () => {
    for (const seed of [1, 2, 3]) {
      const rng = createRng(seed);
      const board = new EngineBoard();
      const placed: number[] = [];
      while (placed.length < 120) {
        const cell = Math.floor(rng() * BOARD_CELLS);
        if (board.cells[cell] !== 0) continue;
        board.place(cell, (placed.length % 2) as Side);
        placed.push(cell);
        expect({ score: board.score, fours: board.fours }).toEqual(reference(board));
      }
      for (const cell of placed.reverse()) board.remove(cell);
      const fresh = new EngineBoard();
      expect(board.cells).toEqual(fresh.cells);
      expect(board.counts).toEqual(fresh.counts);
      expect(board.near).toEqual(fresh.near);
      expect([board.score, board.fours, board.stones, board.hashHi, board.hashLo]).toEqual([[0, 0], [0, 0], 0, 0, 0]);
    }
  });

  it("gives a transposition the same key", () => {
    const first = new EngineBoard();
    first.place(10, 0);
    first.place(20, 1);
    first.place(30, 0);
    const second = new EngineBoard();
    second.place(30, 0);
    second.place(20, 1);
    second.place(10, 0);
    expect([first.hashHi, first.hashLo]).toEqual([second.hashHi, second.hashLo]);
    second.remove(10);
    expect([first.hashHi, first.hashLo]).not.toEqual([second.hashHi, second.hashLo]);
  });

  it("reads bitboards", () => {
    const black = withStone(createBitboard(), 5);
    const white = withStone(createBitboard(), 6);
    const board = EngineBoard.fromBitboards(black, white);
    expect([board.cells[5], board.cells[6], board.stones]).toEqual([1, 2, 2]);
  });
});

describe("EngineBoard.winsAt agrees with checkWin (five or more)", () => {
  it("on random positions, for every empty cell and both colours", () => {
    for (const seed of [11, 12, 13, 14]) {
      const board = randomBoard(seed, 90);
      for (let cell = 0; cell < BOARD_CELLS; cell++) {
        if (board.cells[cell] !== 0) continue;
        for (const side of [0, 1] as const) {
          const own = (other: number) => other === cell || board.cells[other] === side + 1;
          expect(board.winsAt(cell, side)).toBe(checkWin(own, cell) !== null);
        }
      }
    }
  });

  it("an overline of six wins", () => {
    const board = new EngineBoard();
    for (const x of [2, 3, 4, 6, 7]) board.place(cellOf(x, 7), 0);
    expect(board.winsAt(cellOf(5, 7), 0)).toBe(true);
    expect(board.winsAt(cellOf(5, 7), 1)).toBe(false);
  });

  it("a blocked four does not count as a win, and blocking a four removes it", () => {
    const board = new EngineBoard();
    for (const x of [3, 4, 5, 6]) board.place(cellOf(x, 7), 0);
    expect(board.fours[0]).toBe(2);
    board.place(cellOf(7, 7), 1);
    expect(board.fours[0]).toBe(1);
    board.place(cellOf(2, 7), 1);
    expect(board.fours[0]).toBe(0);
    expect(board.winsAt(cellOf(2, 7), 0)).toBe(false);
  });
});

describe("EngineBoard candidates", () => {
  it("are the empty cells within radius 2 of a stone", () => {
    const board = new EngineBoard();
    const out = new Int16Array(BOARD_CELLS);
    expect(board.candidates(out)).toBe(0);
    board.place(0, 0);
    const count = board.candidates(out);
    const expected = [1, 2, 15, 16, 17, 30, 31, 32];
    expect(Array.from(out.subarray(0, count))).toEqual(expected);
    expect(CANDIDATE_RADIUS).toBe(2);
  });

  it("winningCells stops at the limit", () => {
    const board = new EngineBoard();
    for (const x of [3, 4, 5, 6]) board.place(cellOf(x, 7), 0);
    const out = new Int16Array(BOARD_CELLS);
    expect(board.winningCells(0, out, BOARD_CELLS)).toBe(2);
    expect(Array.from(out.subarray(0, 2))).toEqual([cellOf(2, 7), cellOf(7, 7)]);
    expect(board.winningCells(0, out, 1)).toBe(1);
    expect(board.winningCells(1, out, BOARD_CELLS)).toBe(0);
  });
});

describe("EngineBoard.cellValue", () => {
  it("sums the weights the move reaches plus the weighted weights it takes from the opponent", () => {
    const board = new EngineBoard();
    // Corner cell 0 has 3 windows; one opponent stone on the row next to it.
    board.place(1, 1);
    // Own: the row window holds an opponent stone (dead), column and diagonal are empty (1 each).
    // Defence: the row window has one opponent stone and none of ours (weight of 2 stones = 10),
    // column and diagonal are empty (1 each).
    expect(board.cellValue(0, 0, 0.5)).toBe(2 + 0.5 * (10 + 1 + 1));
  });
});
