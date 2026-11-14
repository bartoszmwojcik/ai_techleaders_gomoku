// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaperBoard, type PaperBoardLabels, type PaperBoardProps } from "./paper-board";

const labels: PaperBoardLabels = {
  board: "Plansza",
  cell: ({ x, y, state, allowed, last, auto, selected }) =>
    `${x},${y} ${state}${allowed ? "" : " daleko"}${last ? " ostatni" : ""}${auto ? " automat" : ""}${selected ? " wybrane" : ""}`,
  notAllowed: "Za daleko",
  autoMoved: ({ x, y }) => `Automat ${x},${y}`,
  opponentMarker: ({ dx, dy }) => `Przeciwnik ${dx},${dy}`,
  toolbar: "Nawigacja",
  level: (level) => `${level} × ${level}`,
  zoomIn: "Przybliż",
  zoomOut: "Oddal",
  center: "Wyśrodkuj",
  panLeft: "Okno w lewo",
  panRight: "Okno w prawo",
  panUp: "Okno w górę",
  panDown: "Okno w dół",
  selectionBar: "Zaznaczenie",
  selectionLeft: "Zaznaczenie w lewo",
  selectionRight: "Zaznaczenie w prawo",
  selectionUp: "Zaznaczenie w górę",
  selectionDown: "Zaznaczenie w dół",
};

const colors = { 1: "black", 2: "white" } as const;
const KEY = "gomoku.paper-board.level";

function setup(props: Partial<PaperBoardProps> = {}) {
  const onSelect = vi.fn();
  const view = render(<PaperBoard stones={[]} colors={colors} labels={labels} layout="desktop" onSelect={onSelect} {...props} />);
  return { onSelect, ...view };
}
const cell = (name: string) => screen.getByRole("button", { name });
const cells = () => within(screen.getByRole("grid")).getAllByRole("button");
const frame = () => screen.getByRole("grid").parentElement as HTMLElement;
const focusOn = (element: HTMLElement) => act(() => element.focus());
const levelText = () => screen.getByText(/× /).textContent;

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PaperBoard window", () => {
  it("renders only the window: 21×21 by default on desktop, 15×15 on a phone", () => {
    setup();
    expect(cells()).toHaveLength(21 * 21);
    cleanup();
    setup({ layout: "phone" });
    expect(cells()).toHaveLength(15 * 15);
  }, 30_000); // renders two full boards; the 5s default is too tight when the full suite loads the machine

  it("labels cells with screen coordinates relative to the start", () => {
    setup();
    expect(cell("0,0 empty")).toBeTruthy();
    expect(cell("-10,10 empty")).toBeTruthy();
  });

  it("starts centred on the middle of the stones", () => {
    setup({ stones: [{ x: 60, y: 60, seat: 1 }] });
    expect(cell("10,10 black")).toBeTruthy();
  });

  it("has one tab stop: the last move when given, the window centre when it is off-screen", () => {
    setup({ stones: [{ x: 50, y: 50, seat: 1 }], lastMove: { x: 52, y: 50 } });
    expect(cells().filter((button) => button.tabIndex === 0)).toEqual([cell("2,0 empty ostatni")]);
  });

  it("renders on the server without browser APIs", () => {
    const html = renderToStaticMarkup(<PaperBoard stones={[]} colors={colors} labels={labels} />);
    expect(html).toContain('role="grid"');
  });
});

describe("PaperBoard stones and markers", () => {
  it("shows × for black and ○ for white, frames the last move and breaks the line of automatic moves", () => {
    setup({
      stones: [
        { x: 50, y: 50, seat: 1 },
        { x: 51, y: 50, seat: 2, auto: true },
        { x: 52, y: 50, seat: 2, auto: true },
      ],
      lastMove: { x: 52, y: 50 },
    });
    const cross = cell("0,0 black");
    expect(cross.querySelector("svg path")).toBeTruthy();
    expect(cross.querySelector("svg circle")).toBeNull();
    expect(cross.querySelector("svg")?.getAttribute("class")).toContain("stroke-paper-ink");
    expect(cross.querySelector("span")?.className).not.toContain("outline-paper-pencil");
    const auto = cell("1,0 white automat");
    expect(auto.querySelector("svg circle")).toBeTruthy();
    expect(auto.querySelector("svg")?.getAttribute("class")).toContain("stroke-dasharray");
    expect(auto.querySelector("span")?.className).not.toContain("outline-paper-pencil");
    const last = cell("2,0 white ostatni automat").querySelector("span")?.className;
    expect(last).toContain("outline-paper-pencil");
    expect(last).not.toContain("outline-dashed");
    expect(cross.getAttribute("aria-disabled")).toBe("true");
  });

  it("draws no stone any more", () => {
    const { container } = setup({ stones: [{ x: 50, y: 50, seat: 1 }, { x: 51, y: 50, seat: 2 }] });
    expect(container.innerHTML).not.toContain("bg-piece-");
  });

  it("announces the automaton's move, and nothing for a player's move", () => {
    setup({ stones: [{ x: 51, y: 50, seat: 2, auto: true }], lastMove: { x: 51, y: 50 } });
    expect(screen.getByRole("status").textContent).toBe("Automat 1,0");
    cleanup();
    setup({ stones: [{ x: 51, y: 50, seat: 2 }], lastMove: { x: 51, y: 50 } });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("previews the selection with the chosen seat's mark: a lighter line in a dashed frame", () => {
    setup({ selection: { x: 50, y: 50 }, selectionSeat: 2 });
    const preview = cell("0,0 empty wybrane");
    expect(preview.querySelector("svg circle")).toBeTruthy();
    expect(preview.querySelector("svg")?.getAttribute("class")).toContain("stroke-paper-auto");
    expect(preview.querySelector("span")?.className).toContain("outline-dashed");
    cleanup();
    setup({ selection: { x: 50, y: 50 } });
    expect(cell("0,0 empty wybrane").querySelector("svg path")).toBeTruthy();
  });

  it("draws a pencil stroke through every five, in window coordinates", () => {
    const { container } = setup({
      stones: [{ x: 50, y: 50, seat: 1 }],
      fives: [
        { seat: 1, from: { x: 48, y: 50 }, to: { x: 52, y: 50 } },
        { seat: 2, from: { x: 50, y: 50 }, to: { x: 50, y: 50 } },
      ],
    });
    const lines = container.querySelectorAll("svg line");
    expect(lines).toHaveLength(2);
    expect(lines[0]?.getAttribute("x1")).toBe(String(48 - 40 + 0.5 - 0.3));
    expect(lines[0]?.getAttribute("class")).toContain("stroke-paper-pencil");
    expect(container.querySelector("svg[preserveAspectRatio]")?.getAttribute("viewBox")).toBe("0 0 21 21");
  });

  it("draws the squares along the top and left of each cell, running on into the fading margin at the rim", () => {
    setup({ layout: "phone" });
    expect(screen.getByTestId("paper-sheet").className).toContain("paper-sheet");
    const inner = cell("0,0 empty").parentElement as HTMLElement;
    expect(inner.className).toContain("before:top-0");
    expect(inner.className).toContain("before:left-0");
    expect(inner.className).toContain("before:right-0");
    expect(inner.className).toContain("after:left-0");
    expect(inner.className).toContain("after:top-0");
    expect(inner.className).toContain("after:bottom-0");
    const first = cell("-7,-7 empty").parentElement as HTMLElement;
    expect(first.className).toContain("before:-left-(--board-padding)");
    expect(first.className).toContain("after:-top-(--board-padding)");
    const end = cell("7,7 empty").parentElement as HTMLElement;
    expect(end.className).toContain("before:-right-(--board-padding)");
    expect(end.className).toContain("after:-bottom-(--board-padding)");
    expect(screen.getByTestId("paper-closing-column").className).toContain("-top-(--board-padding)");
    expect(screen.getByTestId("paper-closing-row").className).toContain("-left-(--board-padding)");
  });

  it("ends the lines and thickens them where the whole board ends, at 0 and at 100", () => {
    setup({ layout: "phone", stones: [{ x: 2, y: 2, seat: 1 }] });
    const corner = cell("-50,-50 empty").parentElement as HTMLElement;
    expect(corner.className).toContain("before:left-0");
    expect(corner.className).toContain("after:top-0");
    expect(corner.className).toContain("before:h-[calc(var(--board-line-width)*3)]");
    expect(corner.className).toContain("after:w-[calc(var(--board-line-width)*3)]");
    expect(screen.getByTestId("paper-closing-column").className).toContain("top-0");
    expect(screen.getByTestId("paper-closing-row").className).toContain("left-0");
    cleanup();
    setup({ layout: "phone", stones: [{ x: 98, y: 98, seat: 1 }] });
    const far = cell("50,50 empty").parentElement as HTMLElement;
    expect(far.className).toContain("before:right-0");
    expect(far.className).toContain("after:bottom-0");
    expect(far.className).toContain("before:h-(--board-line-width)");
    expect(screen.getByTestId("paper-closing-column").className).toContain("w-[calc(var(--board-line-width)*3)]");
    expect(screen.getByTestId("paper-closing-row").className).toContain("h-[calc(var(--board-line-width)*3)]");
    expect(screen.getByTestId("paper-closing-column").className).toContain("bottom-0");
  });
});

describe("PaperBoard allowed fields", () => {
  it("highlights and activates allowed fields from a list, deactivates the rest with a description", () => {
    const { onSelect } = setup({ allowed: [{ x: 51, y: 50 }], stones: [{ x: 50, y: 50, seat: 1 }] });
    const near = cell("1,0 empty");
    expect(near.parentElement?.className).toContain("bg-paper-allowed");
    fireEvent.click(near);
    expect(onSelect).toHaveBeenCalledWith({ x: 51, y: 50 });

    const far = cell("5,5 empty daleko");
    expect(far.getAttribute("aria-disabled")).toBe("true");
    expect(far.getAttribute("aria-describedby")).toBe(screen.getByText("Za daleko").id);
    fireEvent.click(far);
    fireEvent.click(cell("0,0 black daleko"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(cell("0,0 black daleko").parentElement?.className).toContain("bg-paper-allowed");
    expect(far.parentElement?.className).not.toContain("bg-paper-allowed");
  });

  it("accepts a predicate, and treats a missing restriction as everywhere", () => {
    const predicate = vi.fn(({ x }: { x: number }) => x === 51);
    const { onSelect } = setup({ allowed: predicate });
    fireEvent.click(cell("1,0 empty"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    cleanup();
    const free = setup();
    fireEvent.click(cell("3,3 empty"));
    expect(free.onSelect).toHaveBeenCalledWith({ x: 53, y: 53 });
    expect(cell("3,3 empty").parentElement?.className).not.toContain("bg-paper-allowed");
  });

  it("does not pick anything when disabled, but still moves around", () => {
    const { onSelect } = setup({ disabled: true });
    fireEvent.click(cell("1,0 empty"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("grid").getAttribute("aria-readonly")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Okno w prawo" }));
    expect(cell("7,0 empty")).toBeTruthy();
  });

  it("works without onSelect", () => {
    render(<PaperBoard stones={[]} colors={colors} labels={labels} layout="desktop" />);
    fireEvent.click(cell("1,0 empty"));
  });
});

describe("PaperBoard zoom", () => {
  it("steps through levels with the buttons and remembers the level", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Oddal" }));
    expect(levelText()).toBe("23 × 23");
    expect(window.localStorage.getItem(KEY)).toBe("23");
    fireEvent.click(screen.getByRole("button", { name: "Przybliż" }));
    fireEvent.click(screen.getByRole("button", { name: "Przybliż" }));
    expect(levelText()).toBe("19 × 19");
    expect(cells()).toHaveLength(19 * 19);
  });

  it("disables the buttons at both ends", () => {
    window.localStorage.setItem(KEY, "15");
    setup();
    expect(screen.getByRole("button", { name: "Przybliż" }).hasAttribute("disabled")).toBe(true);
    cleanup();
    window.localStorage.setItem(KEY, "31");
    setup();
    expect(screen.getByRole("button", { name: "Oddal" }).hasAttribute("disabled")).toBe(true);
    expect(cells()).toHaveLength(31 * 31);
  });

  it("reads a stored level and ignores one that does not fit the layout", () => {
    window.localStorage.setItem(KEY, "27");
    setup();
    expect(levelText()).toBe("27 × 27");
    cleanup();
    setup({ layout: "phone" });
    expect(levelText()).toBe("15 × 15");
  });

  it("works when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setup();
    expect(levelText()).toBe("21 × 21");
    fireEvent.click(screen.getByRole("button", { name: "Oddal" }));
    expect(levelText()).toBe("23 × 23");
  });

  it("uses its own storage key", () => {
    window.localStorage.setItem("other", "17");
    setup({ storageKey: "other" });
    expect(levelText()).toBe("17 × 17");
  });

  it("zooms with Ctrl+wheel only", () => {
    setup();
    const target = frame();
    fireEvent.wheel(target, { deltaY: 100 });
    expect(levelText()).toBe("21 × 21");
    fireEvent.wheel(target, { deltaY: 100, ctrlKey: true });
    expect(levelText()).toBe("23 × 23");
    fireEvent.wheel(target, { deltaY: -100, ctrlKey: true });
    fireEvent.wheel(target, { deltaY: -100, ctrlKey: true });
    expect(levelText()).toBe("19 × 19");
  });

  it("zooms with two fingers", () => {
    setup();
    const target = frame();
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(target, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(target, { pointerId: 2, clientX: 205, clientY: 100 });
    expect(levelText()).toBe("21 × 21");
    fireEvent.pointerMove(target, { pointerId: 2, clientX: 260, clientY: 100 });
    expect(levelText()).toBe("19 × 19");
    fireEvent.pointerMove(target, { pointerId: 2, clientX: 130, clientY: 100 });
    expect(levelText()).toBe("21 × 21");
    fireEvent.pointerUp(target, { pointerId: 2 });
    fireEvent.pointerUp(target, { pointerId: 1 });
  });
});

describe("PaperBoard layout detection", () => {
  it("detects a phone from the media query and follows its changes", () => {
    let listener = () => {};
    const query = {
      matches: true,
      addEventListener: (_: string, callback: () => void) => {
        listener = callback;
      },
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", () => query);
    const { unmount } = render(<PaperBoard stones={[]} colors={colors} labels={labels} />);
    expect(levelText()).toBe("15 × 15");
    expect(screen.getByRole("group", { name: "Zaznaczenie" })).toBeTruthy();
    query.matches = false;
    act(() => listener());
    expect(levelText()).toBe("21 × 21");
    expect(screen.queryByRole("group", { name: "Zaznaczenie" })).toBeNull();
    unmount();
    expect(query.removeEventListener).toHaveBeenCalled();
  });

  it("falls back to desktop without matchMedia", () => {
    render(<PaperBoard stones={[]} colors={colors} labels={labels} />);
    expect(levelText()).toBe("21 × 21");
  });

  it("lets the props force the bar and hide the toolbar", () => {
    setup({ selectionBar: true, toolbar: false });
    expect(screen.getByRole("group", { name: "Zaznaczenie" })).toBeTruthy();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});

describe("PaperBoard panning", () => {
  it("moves the window by ⌊N/3⌋ with the arrows", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Okno w prawo" }));
    expect(cell("7,0 empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Okno w lewo" }));
    fireEvent.click(screen.getByRole("button", { name: "Okno w górę" }));
    expect(cell("0,-7 empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Okno w dół" }));
    expect(cell("0,0 empty")).toBeTruthy();
  });

  it("lets the word of the centre button set its width, unlike the icon buttons of 44 px", () => {
    setup();
    const center = screen.getByRole("button", { name: "Wyśrodkuj" });
    expect(center.className).not.toContain("size-(--target-min)");
    expect(center.className).toContain("h-(--target-min)");
    expect(center.className).toContain("min-w-target");
    expect(center.className).toContain("whitespace-nowrap");
    expect(screen.getByRole("button", { name: "Okno w lewo" }).className).toContain("size-(--target-min)");
  });

  it("centres on the last move, or on the stones without one", () => {
    const { rerender } = setup({ stones: [{ x: 50, y: 50, seat: 1 }], lastMove: { x: 70, y: 50 } });
    fireEvent.click(screen.getByRole("button", { name: "Okno w prawo" }));
    fireEvent.click(screen.getByRole("button", { name: "Wyśrodkuj" }));
    expect(cell("20,0 empty ostatni".replace(" empty", " empty")).tabIndex).toBe(0);
    rerender(<PaperBoard stones={[{ x: 50, y: 50, seat: 1 }]} colors={colors} labels={labels} layout="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Wyśrodkuj" }));
    expect(cell("0,0 black")).toBeTruthy();
  });

  it("recentres on the stones when the token changes", () => {
    const stones = [{ x: 50, y: 50, seat: 1 as const }];
    const { rerender } = setup({ stones, recenterToken: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Okno w prawo" }));
    expect(cell("7,0 empty")).toBeTruthy();
    rerender(<PaperBoard stones={stones} colors={colors} labels={labels} layout="desktop" recenterToken={1} />);
    expect(cell("7,0 empty")).toBeTruthy();
    rerender(<PaperBoard stones={stones} colors={colors} labels={labels} layout="desktop" recenterToken={2} />);
    expect(cell("0,0 black")).toBeTruthy();
  });

  it("drags the window after 8 px, and a tap stays a tap", () => {
    const { onSelect } = setup();
    const target = frame();
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ width: 210 } as DOMRect);

    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 104, clientY: 100 });
    fireEvent.pointerUp(target, { pointerId: 1 });
    fireEvent.click(cell("1,0 empty"));
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 70, clientY: 100 });
    fireEvent.pointerUp(target, { pointerId: 1 });
    expect(cell("3,0 empty")).toBeTruthy();
    fireEvent.click(cell("3,0 empty"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(target, { pointerId: 1 });
    fireEvent.click(cell("3,0 empty"));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("ignores moves of unknown pointers and moves after the drag ended", () => {
    setup();
    const target = frame();
    fireEvent.pointerMove(target, { pointerId: 9, clientX: 50, clientY: 50 });
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(target, { pointerId: 1 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerLeave(target, { pointerId: 1 });
    expect(cell("0,0 empty")).toBeTruthy();
  });

  it("ignores a second finger lifting while the first one only presses", () => {
    setup();
    const target = frame();
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(target, { pointerId: 2, clientX: 150, clientY: 100 });
    fireEvent.pointerUp(target, { pointerId: 2 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 40, clientY: 100 });
    fireEvent.pointerUp(target, { pointerId: 1 });
    expect(cell("0,0 empty")).toBeTruthy();
  });
});

describe("PaperBoard keyboard", () => {
  it("moves focus with the arrows and shifts the window by one at its edge", () => {
    setup();
    const start = cell("0,0 empty");
    focusOn(start);
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("1,0 empty"));
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell("0,0 empty"));

    focusOn(cell("10,0 empty"));
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("11,0 empty"));
    expect(screen.queryByRole("button", { name: "-10,0 empty" })).toBeNull();
  });

  it("ignores other keys", () => {
    setup();
    const start = cell("0,0 empty");
    focusOn(start);
    fireEvent.keyDown(start, { key: "a" });
    expect(document.activeElement).toBe(start);
  });

  it("keeps the focus inside the board", () => {
    setup({ layout: "phone", stones: [{ x: 0, y: 0, seat: 1 }] });
    const corner = cell("-50,-50 black");
    focusOn(corner);
    fireEvent.keyDown(corner, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(corner);
  });

  it("falls back to the window centre as the tab stop when the focused cell scrolled away", () => {
    setup();
    focusOn(cell("0,0 empty"));
    fireEvent.click(screen.getByRole("button", { name: "Okno w prawo" }));
    fireEvent.click(screen.getByRole("button", { name: "Okno w prawo" }));
    fireEvent.click(screen.getByRole("button", { name: "Okno w prawo" }));
    expect(cells().filter((button) => button.tabIndex === 0)).toEqual([cell("21,0 empty")]);
  });
});

describe("PaperBoard opponent marker", () => {
  it("points at an off-screen opponent move and centres on it when pressed", () => {
    setup({ opponentMove: { x: 80, y: 50 } });
    const marker = screen.getByRole("button", { name: "Przeciwnik 1,0" });
    expect(marker.className).toContain("right-1");
    fireEvent.click(marker);
    expect(screen.queryByRole("button", { name: /Przeciwnik/ })).toBeNull();
    expect(cell("30,0 empty")).toBeTruthy();
  });

  it("is placed by direction on the edges and corners", () => {
    setup({ opponentMove: { x: 20, y: 20 } });
    const marker = screen.getByRole("button", { name: "Przeciwnik -1,-1" });
    expect(marker.className).toContain("left-1");
    expect(marker.className).toContain("top-1");
    cleanup();
    setup({ opponentMove: { x: 50, y: 90 } });
    expect(screen.getByRole("button", { name: "Przeciwnik 0,1" }).className).toContain("-translate-x-1/2");
  });

  it("is absent when the move is visible or not given", () => {
    setup({ opponentMove: { x: 51, y: 50 } });
    expect(screen.queryByRole("button", { name: /Przeciwnik/ })).toBeNull();
  });
});

describe("PaperBoard touch bar", () => {
  it("moves the selection one field from the selection, the last move or the middle", () => {
    const { onSelect, rerender } = setup({ selectionBar: true, layout: "phone", selection: { x: 50, y: 50 }, lastMove: { x: 40, y: 40 } });
    fireEvent.click(screen.getByRole("button", { name: "Zaznaczenie w prawo" }));
    expect(onSelect).toHaveBeenLastCalledWith({ x: 51, y: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Zaznaczenie w lewo" }));
    expect(onSelect).toHaveBeenLastCalledWith({ x: 49, y: 50 });
    fireEvent.click(screen.getByRole("button", { name: "Zaznaczenie w górę" }));
    expect(onSelect).toHaveBeenLastCalledWith({ x: 50, y: 49 });
    fireEvent.click(screen.getByRole("button", { name: "Zaznaczenie w dół" }));
    expect(onSelect).toHaveBeenLastCalledWith({ x: 50, y: 51 });

    rerender(<PaperBoard stones={[]} colors={colors} labels={labels} layout="phone" onSelect={onSelect} lastMove={{ x: 40, y: 40 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Zaznaczenie w prawo" }));
    expect(onSelect).toHaveBeenLastCalledWith({ x: 41, y: 40 });
    rerender(<PaperBoard stones={[]} colors={colors} labels={labels} layout="phone" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Zaznaczenie w prawo" }));
    expect(onSelect).toHaveBeenLastCalledWith({ x: 51, y: 50 });
  });

  it("is disabled with the board, and does not need onSelect", () => {
    setup({ layout: "phone", disabled: true });
    expect(screen.getByRole("button", { name: "Zaznaczenie w prawo" }).hasAttribute("disabled")).toBe(true);
    cleanup();
    render(<PaperBoard stones={[]} colors={colors} labels={labels} layout="phone" />);
    fireEvent.click(screen.getByRole("button", { name: "Zaznaczenie w prawo" }));
  });

  it("has the − and + buttons on the bar (not in the toolbar) and 6 buttons of 44 px", () => {
    setup({ layout: "phone" });
    const bar = screen.getByRole("group", { name: "Zaznaczenie" });
    expect(within(bar).getAllByRole("button")).toHaveLength(6);
    expect(within(screen.getByRole("toolbar")).queryByRole("button", { name: "Oddal" })).toBeNull();
    fireEvent.click(within(bar).getByRole("button", { name: "Oddal" }));
    expect(levelText()).toBe("17 × 17");
    expect(within(bar).getAllByRole("button")[0]?.className).toContain("size-(--target-min)");
  });

  it("shows the selection when it was moved off-screen, with the smallest shift", () => {
    const { rerender } = setup({ layout: "phone", selection: { x: 50, y: 50 } });
    rerender(<PaperBoard stones={[]} colors={colors} labels={labels} layout="phone" selection={{ x: 60, y: 50 }} />);
    expect(cell("10,0 empty wybrane")).toBeTruthy();
    rerender(<PaperBoard stones={[]} colors={colors} labels={labels} layout="phone" />);
    expect(cell("10,0 empty")).toBeTruthy();
  });
});
