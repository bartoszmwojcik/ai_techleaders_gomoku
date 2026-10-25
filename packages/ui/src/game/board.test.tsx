// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Board, BOARD_SIZE, type BoardProps } from "./board";

afterEach(cleanup);

const cellLabel: BoardProps["cellLabel"] = ({ column, row, state }) => `${column}${row} ${state}`;

function renderBoard(props: Partial<BoardProps> = {}) {
  return render(<Board label="Plansza 15 na 15" cellLabel={cellLabel} stones={[]} {...props} />);
}

const cell = (column: string, row: number, state = "empty") => screen.getByRole("button", { name: `${column}${row} ${state}` });

describe("Board", () => {
  it("is a grid of 15 rows with 15 cells each, every cell a named button", () => {
    renderBoard();

    const grid = screen.getByRole("grid", { name: "Plansza 15 na 15" });
    expect(within(grid).getAllByRole("row")).toHaveLength(BOARD_SIZE);
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(BOARD_SIZE * BOARD_SIZE);
    expect(within(grid).getAllByRole("button")).toHaveLength(BOARD_SIZE * BOARD_SIZE);
    expect(cell("A", 1)).toBeTruthy();
    expect(cell("O", 15)).toBeTruthy();
  });

  it("has a single tab stop, in the middle at first", () => {
    renderBoard();

    const stops = screen.getAllByRole("button").filter((button) => button.tabIndex === 0);
    expect(stops).toEqual([cell("H", 8)]);
  });

  it("shows stones, marks them occupied and names the cell state", () => {
    renderBoard({
      stones: [
        { cell: 7 * 15 + 7, color: "black" },
        { cell: 7 * 15 + 8, color: "white" },
      ],
    });

    expect(cell("H", 8, "black").getAttribute("aria-disabled")).toBe("true");
    expect(cell("I", 8, "white").getAttribute("aria-disabled")).toBe("true");
    expect(cell("H", 8, "black").querySelector("span")?.className).toContain("bg-piece-black");
    expect(cell("I", 8, "white").querySelector("span")?.className).toContain("bg-piece-white");
    expect(cell("A", 1).getAttribute("aria-disabled")).toBeNull();
  });

  it("outlines the last move and the winning line", () => {
    renderBoard({
      stones: [0, 1, 2].map((cellIndex) => ({ cell: cellIndex, color: "black" as const })),
      lastMove: 2,
      winLine: [0, 1],
    });

    expect(cell("C", 1, "black").querySelector("span")?.className).toContain("outline-2");
    expect(cell("A", 1, "black").querySelector("span")?.className).toContain("outline-4");
    expect(cell("B", 1, "black").querySelector("span")?.className).toContain("outline-4");
  });

  it("previews a picked cell with a dashed stone but not over an existing stone", () => {
    renderBoard({
      stones: [{ cell: 1, color: "white" }],
      selected: { cell: 0, color: "black" },
    });

    const preview = cell("A", 1).querySelector("span");
    expect(preview?.className).toContain("border-dashed");
    expect(preview?.className).toContain("bg-piece-black");
    expect(cell("B", 1, "white").querySelector("span")?.className).not.toContain("border-dashed");
  });

  it("does not preview a selection that sits on a stone", () => {
    renderBoard({ stones: [{ cell: 0, color: "white" }], selected: { cell: 0, color: "black" } });

    const stone = cell("A", 1, "white").querySelector("span");
    expect(stone?.className).toContain("bg-piece-white");
    expect(stone?.className).not.toContain("border-dashed");
  });

  it("reports a picked empty cell and ignores occupied ones", async () => {
    const user = userEvent.setup();
    const onCellSelect = vi.fn();
    renderBoard({ stones: [{ cell: 1, color: "black" }], onCellSelect });

    await user.click(cell("A", 1));
    await user.click(cell("B", 1, "black"));

    expect(onCellSelect).toHaveBeenCalledTimes(1);
    expect(onCellSelect).toHaveBeenCalledWith(0);
  });

  it("does nothing on click without a handler", async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(cell("A", 1));

    expect(screen.getByRole("grid").getAttribute("aria-readonly")).toBeNull();
  });

  it("can be read but not played when read only", async () => {
    const user = userEvent.setup();
    const onCellSelect = vi.fn();
    renderBoard({ readOnly: true, onCellSelect });

    await user.click(cell("A", 1));

    expect(screen.getByRole("grid").getAttribute("aria-readonly")).toBe("true");
    expect(onCellSelect).not.toHaveBeenCalled();
  });

  it("moves focus with the arrow keys, one tab stop at a time", async () => {
    const user = userEvent.setup();
    renderBoard();

    cell("H", 8).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(cell("I", 8));
    expect(cell("I", 8).tabIndex).toBe(0);
    expect(cell("H", 8).tabIndex).toBe(-1);

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(cell("I", 9));
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(cell("H", 9));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(cell("H", 8));
  });

  it("stays on the edge instead of wrapping", async () => {
    const user = userEvent.setup();
    renderBoard();

    cell("A", 1).focus();
    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(document.activeElement).toBe(cell("A", 1));

    cell("O", 15).focus();
    await user.keyboard("{ArrowDown}{ArrowRight}");
    expect(document.activeElement).toBe(cell("O", 15));
  });

  it("leaves other keys alone and picks a cell with Enter", async () => {
    const user = userEvent.setup();
    const onCellSelect = vi.fn();
    renderBoard({ onCellSelect });

    cell("H", 8).focus();
    await user.keyboard("x");
    expect(document.activeElement).toBe(cell("H", 8));
    await user.keyboard("{Enter}");

    expect(onCellSelect).toHaveBeenCalledWith(7 * 15 + 7);
  });

  it("shows hidden coordinates A to O and 1 to 15 and merges a class", () => {
    const { container } = renderBoard({ className: "mx-auto" });

    const letters = [...container.querySelectorAll('[aria-hidden="true"] > span, span[aria-hidden="true"]')]
      .map((element) => element.textContent)
      .filter(Boolean);
    expect(letters).toContain("A");
    expect(letters).toContain("O");
    expect(letters).toContain("15");
    expect(screen.getByRole("grid").className).toContain("mx-auto");
  });
});
