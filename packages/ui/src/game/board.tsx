"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "./cn";

// Same size as BOARD_SIZE in @gomoku/core (the ui package may not depend on core).
export const BOARD_SIZE = 15;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const FIRST_FOCUSED_CELL = Math.floor(CELL_COUNT / 2);

type StoneColor = "black" | "white";
type Stone = { cell: number; color: StoneColor };
type BoardCellInfo = { column: string; row: number; state: "empty" | StoneColor };

type BoardProps = {
  /** Stones on the board; a cell is an index 0..224 (row * 15 + column, row 0 at the top). */
  stones: readonly Stone[];
  /** Name of the whole board for screen readers (required), e.g. "Plansza 15 na 15". */
  label: string;
  /** Names one cell for screen readers (required), e.g. "Kolumna C, rząd 7, puste". */
  cellLabel: (cell: BoardCellInfo) => string;
  /** Runs when the player picks an empty cell (click, Enter or Space). */
  onCellSelect?: (cell: number) => void;
  /** A finished game or the opponent's turn: cells can be read but not picked. */
  readOnly?: boolean;
  /** The last stone placed, marked with an outline. */
  lastMove?: number;
  /** The cells of the winning line, marked with a thick outline. */
  winLine?: readonly number[];
  /** A cell picked on a touch screen and waiting for confirmation (dashed outline). */
  selected?: { cell: number; color: StoneColor };
  className?: string;
};

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const COLUMN_LETTERS = Array.from({ length: BOARD_SIZE }, (_, column) => String.fromCharCode(65 + column));

function Board({
  stones,
  label,
  cellLabel,
  onCellSelect,
  readOnly = false,
  lastMove,
  winLine = [],
  selected,
  className,
}: BoardProps) {
  const [focusedCell, setFocusedCell] = useState(FIRST_FOCUSED_CELL);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const stoneAt = new Map(stones.map(({ cell, color }) => [cell, color]));

  function moveFocus(event: KeyboardEvent) {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    const column = Math.min(BOARD_SIZE - 1, Math.max(0, (focusedCell % BOARD_SIZE) + arrow[0]));
    const row = Math.min(BOARD_SIZE - 1, Math.max(0, Math.floor(focusedCell / BOARD_SIZE) + arrow[1]));
    const next = row * BOARD_SIZE + column;
    setFocusedCell(next);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="grid"
      aria-label={label}
      aria-readonly={readOnly || undefined}
      onKeyDown={moveFocus}
      style={{ gridTemplateColumns: `auto repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
      className={cn(
        "board-texture @container grid w-full max-w-(--layout-width-board) rounded-base bg-board-surface p-(--board-padding) text-meta text-piece-outline shadow-board",
        className,
      )}
    >
      <div role="presentation" aria-hidden="true" className="contents">
        <span className="hidden @md:block" />
        {COLUMN_LETTERS.map((letter) => (
          <span key={letter} className="hidden justify-self-center pb-1 @md:block">
            {letter}
          </span>
        ))}
      </div>
      {Array.from({ length: BOARD_SIZE }, (_, row) => (
        <div role="row" key={row} className="contents">
          <span aria-hidden="true" className="flex h-0 w-0 items-center justify-end overflow-hidden @md:h-auto @md:w-auto @md:pr-2">
            {row + 1}
          </span>
          {Array.from({ length: BOARD_SIZE }, (_, column) => {
            const cell = row * BOARD_SIZE + column;
            const color = stoneAt.get(cell);
            const isSelected = selected?.cell === cell;
            const state = color ?? "empty";
            const inWinLine = winLine.includes(cell);
            const shown = isSelected && !color ? selected.color : color;
            return (
              <div
                role="gridcell"
                key={cell}
                className="relative aspect-square before:absolute before:inset-x-0 before:top-1/2 before:h-(--board-line-width) before:bg-board-line after:absolute after:inset-y-0 after:left-1/2 after:w-(--board-line-width) after:bg-board-line"
              >
                <button
                  type="button"
                  ref={(element) => {
                    buttons.current[cell] = element;
                  }}
                  tabIndex={cell === focusedCell ? 0 : -1}
                  aria-label={cellLabel({ column: COLUMN_LETTERS[column] as string, row: row + 1, state })}
                  aria-disabled={color ? true : undefined}
                  onFocus={() => setFocusedCell(cell)}
                  onClick={() => {
                    if (!readOnly && !color) onCellSelect?.(cell);
                  }}
                  className="absolute inset-0 z-10 flex items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-piece-outline"
                >
                  {shown && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-(--piece-size) rounded-piece border border-piece-outline shadow-piece",
                        shown === "black" ? "bg-piece-black" : "bg-piece-white",
                        isSelected && !color && "border-2 border-dashed",
                        cell === lastMove && "outline-2 outline-offset-2 outline-board-marker",
                        inWinLine && "outline-4 outline-offset-2 outline-board-marker",
                      )}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export { Board };
export type { BoardCellInfo, BoardProps, Stone, StoneColor };
