import type { BoardCellInfo, Stone } from "@gomoku/ui/game/board";

// Fictitious data of the demo (map section 3). Numbers come from the brief: 15×15 board, 10 minutes per player.

const STATE_WORD = { empty: "puste", black: "czarny kamień", white: "biały kamień" } as const;

export const cellLabel = ({ column, row, state }: BoardCellInfo) => `Kolumna ${column}, rząd ${row}, ${STATE_WORD[state]}`;

const at = (row: number, column: number) => (row - 1) * 15 + (column - 1);

/** A few stones in the middle of the board, as in the design system's home page. */
export const OPENING: readonly Stone[] = [
  { cell: at(8, 8), color: "black" },
  { cell: at(8, 9), color: "white" },
  { cell: at(9, 9), color: "black" },
  { cell: at(7, 7), color: "white" },
  { cell: at(10, 10), color: "black" },
  { cell: at(9, 7), color: "white" },
];
