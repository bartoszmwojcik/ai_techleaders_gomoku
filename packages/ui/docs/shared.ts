import type { BoardCellInfo, Stone } from "@gomoku/ui/game/board";

// Sample data for stories: Polish copy taken from the specifications; the positions are invented.

const STATE_WORD = { empty: "puste", black: "czarny kamień", white: "biały kamień" } as const;

export function cellLabel({ column, row, state }: BoardCellInfo): string {
  return `Kolumna ${column}, rząd ${row}, ${STATE_WORD[state]}`;
}

const at = (row: number, column: number) => (row - 1) * 15 + (column - 1);

/** A few stones in the middle of the board, as on the home page. */
export const OPENING: readonly Stone[] = [
  { cell: at(8, 8), color: "black" },
  { cell: at(8, 9), color: "white" },
  { cell: at(9, 9), color: "black" },
  { cell: at(7, 7), color: "white" },
  { cell: at(10, 10), color: "black" },
  { cell: at(9, 7), color: "white" },
];

/** A game in progress, black to move after white played the last stone. */
export const MIDGAME: readonly Stone[] = [
  ...OPENING,
  { cell: at(11, 11), color: "black" },
  { cell: at(6, 6), color: "white" },
  { cell: at(8, 10), color: "black" },
  { cell: at(8, 7), color: "white" },
];
export const MIDGAME_LAST_MOVE = at(8, 7);

/** Black wins with five in a row on row 8, columns D to H. */
export const WIN_LINE: readonly number[] = [4, 5, 6, 7, 8].map((column) => at(8, column));
export const WON_GAME: readonly Stone[] = [
  ...WIN_LINE.map((cell) => ({ cell, color: "black" as const })),
  ...[4, 5, 6, 7].map((column) => ({ cell: at(9, column), color: "white" as const })),
];
export const WON_LAST_MOVE = at(8, 8);
