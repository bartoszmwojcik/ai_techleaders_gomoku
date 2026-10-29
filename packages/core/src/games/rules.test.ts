import { describe, expect, it } from "vitest";

import { BOARD_CELLS, cellOf } from "./board";
import { BOARD_SIZE, WIN_LENGTH, checkWin, seatOnTurn, turnColor } from "./rules";

function own(cells: number[]) {
  const set = new Set(cells);
  return (cell: number) => set.has(cell);
}

function line(x: number, y: number, dx: number, dy: number, length: number): number[] {
  return Array.from({ length }, (_, i) => cellOf(x + dx * i, y + dy * i));
}

describe("game rules", () => {
  it("uses a 15×15 board with five in a row to win (freestyle gomoku)", () => {
    expect(BOARD_SIZE).toBe(15);
    expect(WIN_LENGTH).toBe(5);
  });

  it("gives black the odd moves and maps them to seats", () => {
    expect(turnColor(0)).toBe("black");
    expect(turnColor(1)).toBe("white");
    expect(turnColor(224)).toBe("black");
    expect(seatOnTurn(0, 1)).toBe(1);
    expect(seatOnTurn(1, 1)).toBe(2);
    expect(seatOnTurn(0, 2)).toBe(2);
    expect(seatOnTurn(1, 2)).toBe(1);
  });
});

describe("checkWin", () => {
  const axes = [
    ["horizontal", 3, 4, 1, 0],
    ["vertical", 3, 4, 0, 1],
    ["diagonal down", 3, 4, 1, 1],
    ["diagonal up", 3, 9, 1, -1],
  ] as const;

  it.each(axes)("finds five on the %s axis from any of its stones", (_name, x, y, dx, dy) => {
    const cells = line(x, y, dx, dy, 5);
    for (const cell of cells) {
      expect(checkWin(own(cells), cell)).toEqual(
        [...cells].sort((a, b) => a - b),
      );
    }
  });

  it("does not win with four", () => {
    const cells = line(3, 4, 1, 0, 4);
    expect(checkWin(own(cells), cells[3]!)).toBeNull();
  });

  it("joins two groups (XX_XX)", () => {
    const cells = [...line(2, 7, 1, 0, 2), ...line(5, 7, 1, 0, 2), cellOf(4, 7)];
    expect(checkWin(own(cells), cellOf(4, 7))).toEqual(line(2, 7, 1, 0, 5));
  });

  it("wins with six or more and returns the whole run", () => {
    const six = line(1, 1, 1, 1, 6);
    expect(checkWin(own(six), six[2]!)).toEqual(six);
    const nine = line(0, 6, 1, 0, 9);
    expect(checkWin(own(nine), nine[4]!)).toEqual(nine);
  });

  it("a stone of the opponent breaks the run", () => {
    const cells = [...line(0, 0, 1, 0, 2), ...line(3, 0, 1, 0, 3)];
    expect(checkWin(own(cells), cellOf(3, 0))).toBeNull();
  });

  it("finds lines on the edges and in the corners", () => {
    const bottom = line(10, 14, 1, 0, 5);
    expect(checkWin(own(bottom), bottom[4]!)).toEqual(bottom);
    const right = line(14, 0, 0, 1, 5);
    expect(checkWin(own(right), right[0]!)).toEqual(right);
    const corner = line(0, 0, 1, 1, 5);
    expect(checkWin(own(corner), corner[0]!)).toEqual(corner);
    const corner2 = line(14, 0, -1, 1, 5);
    expect(checkWin(own(corner2), corner2[0]!)).toEqual([...corner2].sort((a, b) => a - b));
  });

  it("does not wrap from the end of one row to the start of the next", () => {
    // cells 12..16 are consecutive indices but straddle the row break (x = 12, 13, 14 | 0, 1)
    const wrapped = [12, 13, 14, 15, 16];
    expect(checkWin(own(wrapped), 14)).toBeNull();
    expect(checkWin(own(wrapped), 15)).toBeNull();
  });

  it("reads at most 32 cells whatever the board holds", () => {
    const full = () => true;
    let reads = 0;
    const counting = (cell: number) => {
      reads++;
      return full() && cell >= 0 && cell < BOARD_CELLS;
    };
    checkWin(counting, cellOf(7, 7));
    expect(reads).toBeLessThanOrEqual(32);

    reads = 0;
    checkWin((cell) => (reads++, cell === cellOf(7, 7)), cellOf(7, 7));
    expect(reads).toBeLessThanOrEqual(32);
  });
});
