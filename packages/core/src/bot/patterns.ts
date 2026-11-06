import { BOARD_CELLS, hasStone, type Bitboard } from "../games/board";
import { BOARD_SIZE, WIN_LENGTH } from "../games/rules";
import { ZOBRIST_HI, ZOBRIST_LO } from "./zobrist";

/** Engine colours: 0 = black, 1 = white. */
export type Side = 0 | 1;

/** Radius of the candidate moves around existing stones (spec: promień 2). */
export const CANDIDATE_RADIUS = 2;
/** Centre of the board: the first move. */
export const CENTER = (BOARD_SIZE >> 1) * BOARD_SIZE + (BOARD_SIZE >> 1);

/**
 * Weight of a 5-cell window holding `k` stones of one colour and none of the other
 * (spec: 1/10/100/1000/zwycięstwo). Index 5 — a finished five — only shows up when a cell is
 * valued, never in a position the search keeps.
 */
export const WINDOW_WEIGHTS = [0, 1, 10, 100, 1000, 100_000] as const;

/** Every 5-cell window of the board as five consecutive cells; a line of six or more contains one. */
function buildWindows(): Int16Array {
  const cells: number[] = [];
  const axes = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (const [dx, dy] of axes) {
        const endX = x + dx * (WIN_LENGTH - 1);
        const endY = y + dy * (WIN_LENGTH - 1);
        if (endX >= BOARD_SIZE || endY < 0 || endY >= BOARD_SIZE) continue;
        for (let step = 0; step < WIN_LENGTH; step++) {
          cells.push((y + dy * step) * BOARD_SIZE + x + dx * step);
        }
      }
    }
  }
  return Int16Array.from(cells);
}

export const WINDOWS = buildWindows();
export const WINDOW_COUNT = WINDOWS.length / WIN_LENGTH;

/** For each cell the windows containing it: `CELL_WINDOWS[CELL_WINDOW_START[c] .. CELL_WINDOW_START[c + 1])`. */
function buildCellIndex(lists: number[][]): { start: Int32Array; items: Int16Array } {
  const start = new Int32Array(BOARD_CELLS + 1);
  const items: number[] = [];
  lists.forEach((list, cell) => {
    start[cell] = items.length;
    items.push(...list);
  });
  start[BOARD_CELLS] = items.length;
  return { start, items: Int16Array.from(items) };
}

const windowLists: number[][] = Array.from({ length: BOARD_CELLS }, () => []);
for (let window = 0; window < WINDOW_COUNT; window++) {
  for (let step = 0; step < WIN_LENGTH; step++) windowLists[WINDOWS[window * WIN_LENGTH + step]!]!.push(window);
}
const windowIndex = buildCellIndex(windowLists);
export const CELL_WINDOW_START = windowIndex.start;
export const CELL_WINDOWS = windowIndex.items;

const neighbourLists: number[][] = Array.from({ length: BOARD_CELLS }, (_, cell) => {
  const x = cell % BOARD_SIZE;
  const y = Math.floor(cell / BOARD_SIZE);
  const list: number[] = [];
  for (let dy = -CANDIDATE_RADIUS; dy <= CANDIDATE_RADIUS; dy++) {
    for (let dx = -CANDIDATE_RADIUS; dx <= CANDIDATE_RADIUS; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx !== 0 || dy !== 0) && nx >= 0 && ny >= 0 && nx < BOARD_SIZE && ny < BOARD_SIZE) {
        list.push(ny * BOARD_SIZE + nx);
      }
    }
  }
  return list;
});
const neighbourIndex = buildCellIndex(neighbourLists);

/**
 * The engine's own fast board (spec, „Silnik”): a 225-cell array plus, for every 5-cell window,
 * the number of black and white stones, updated incrementally on `place`/`remove`. It also keeps
 * the pattern score of each colour, the number of „fours” (windows one stone short of five) and
 * the Zobrist key. Freestyle rules: five or more in a row win, as `checkWin` in `rules.ts`.
 */
export class EngineBoard {
  /** 0 empty, 1 black, 2 white. */
  readonly cells = new Int8Array(BOARD_CELLS);
  /** Stones of each colour per window. */
  readonly counts: [Int8Array, Int8Array] = [new Int8Array(WINDOW_COUNT), new Int8Array(WINDOW_COUNT)];
  /** Sum of `WINDOW_WEIGHTS` over windows free of the other colour. */
  readonly score: [number, number] = [0, 0];
  /** Windows holding four stones of a colour and an empty cell: a win on the next move. */
  readonly fours: [number, number] = [0, 0];
  /** Stones within `CANDIDATE_RADIUS` of each cell. */
  readonly near = new Int16Array(BOARD_CELLS);
  stones = 0;
  hashHi = 0;
  hashLo = 0;

  static fromBitboards(black: Bitboard, white: Bitboard): EngineBoard {
    const board = new EngineBoard();
    for (let cell = 0; cell < BOARD_CELLS; cell++) {
      if (hasStone(black, cell)) board.place(cell, 0);
      else if (hasStone(white, cell)) board.place(cell, 1);
    }
    return board;
  }

  place(cell: number, side: Side): void {
    this.cells[cell] = side + 1;
    this.#update(cell, side, 1);
    this.stones++;
  }

  remove(cell: number): void {
    const side = (this.cells[cell]! - 1) as Side;
    this.cells[cell] = 0;
    this.#update(cell, side, -1);
    this.stones--;
  }

  #update(cell: number, side: Side, delta: 1 | -1): void {
    const own = this.counts[side];
    const other = this.counts[(1 - side) as Side];
    for (let index = CELL_WINDOW_START[cell]!; index < CELL_WINDOW_START[cell + 1]!; index++) {
      const window = CELL_WINDOWS[index]!;
      const otherCount = other[window]!;
      const before = own[window]!;
      const after = before + delta;
      own[window] = after;
      if (otherCount === 0) {
        this.score[side] += WINDOW_WEIGHTS[after]! - WINDOW_WEIGHTS[before]!;
        this.fours[side] += (after === 4 ? 1 : 0) - (before === 4 ? 1 : 0);
      }
      // The other colour's window is alive only while this side has no stone in it.
      if (before === 0 || after === 0) {
        const sign = after === 0 ? 1 : -1;
        const otherSide = (1 - side) as Side;
        this.score[otherSide] += sign * WINDOW_WEIGHTS[otherCount]!;
        if (otherCount === 4) this.fours[otherSide] += sign;
      }
    }
    for (let index = neighbourIndex.start[cell]!; index < neighbourIndex.start[cell + 1]!; index++) {
      this.near[neighbourIndex.items[index]!]! += delta;
    }
    const key = cell * 2 + side;
    this.hashHi ^= ZOBRIST_HI[key]!;
    this.hashLo ^= ZOBRIST_LO[key]!;
  }

  /** Whether `side` playing on the empty `cell` makes five or more in a row. */
  winsAt(cell: number, side: Side): boolean {
    const own = this.counts[side];
    const other = this.counts[(1 - side) as Side];
    for (let index = CELL_WINDOW_START[cell]!; index < CELL_WINDOW_START[cell + 1]!; index++) {
      const window = CELL_WINDOWS[index]!;
      if (own[window] === 4 && other[window] === 0) return true;
    }
    return false;
  }

  /**
   * Value of the empty `cell` for `side`: the weights the move would reach in its windows
   * (attack) plus `defenseFactor` times the weights it takes away from the opponent (defence).
   */
  cellValue(cell: number, side: Side, defenseFactor: number): number {
    const own = this.counts[side];
    const other = this.counts[(1 - side) as Side];
    let attack = 0;
    let defense = 0;
    for (let index = CELL_WINDOW_START[cell]!; index < CELL_WINDOW_START[cell + 1]!; index++) {
      const window = CELL_WINDOWS[index]!;
      const ownCount = own[window]!;
      const otherCount = other[window]!;
      if (otherCount === 0) attack += WINDOW_WEIGHTS[ownCount + 1]!;
      if (ownCount === 0) defense += WINDOW_WEIGHTS[otherCount + 1]!;
    }
    return attack + defenseFactor * defense;
  }

  /** Empty cells within `CANDIDATE_RADIUS` of a stone, written to `out`; returns how many. */
  candidates(out: Int16Array): number {
    let length = 0;
    for (let cell = 0; cell < BOARD_CELLS; cell++) {
      if (this.cells[cell] === 0 && this.near[cell]! > 0) out[length++] = cell;
    }
    return length;
  }

  /** Cells where `side` would win at once (at most `limit` of them), written to `out`. */
  winningCells(side: Side, out: Int16Array, limit: number): number {
    let length = 0;
    for (let cell = 0; cell < BOARD_CELLS && length < limit; cell++) {
      if (this.cells[cell] === 0 && this.near[cell]! > 0 && this.winsAt(cell, side)) out[length++] = cell;
    }
    return length;
  }
}
