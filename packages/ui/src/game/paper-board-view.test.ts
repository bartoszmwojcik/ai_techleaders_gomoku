import { describe, expect, it } from "vitest";

import {
  centerView,
  clamp,
  clampView,
  defaultLevel,
  dragView,
  fitLevel,
  isInWindow,
  levelsFor,
  makeView,
  moveSelection,
  offscreenDirection,
  panByStep,
  panStep,
  panView,
  parseStoredLevel,
  pinchStep,
  revealPoint,
  startDrag,
  stonesCenter,
  toScreen,
  windowStart,
  zoomView,
} from "./paper-board-view";

describe("levels", () => {
  it("phone 15–21, desktop 15–31 in steps of two, with the defaults from the spec", () => {
    expect(levelsFor("phone")).toEqual([15, 17, 19, 21]);
    expect(levelsFor("desktop")).toHaveLength(9);
    expect(levelsFor("desktop").at(-1)).toBe(31);
    expect(defaultLevel("phone")).toBe(15);
    expect(defaultLevel("desktop")).toBe(21);
  });

  it("reads a stored level only when valid for the layout", () => {
    expect(parseStoredLevel("19", "phone")).toBe(19);
    expect(parseStoredLevel("25", "desktop")).toBe(25);
    expect(parseStoredLevel("25", "phone")).toBe(15);
    expect(parseStoredLevel("abc", "desktop")).toBe(21);
    expect(parseStoredLevel(null, "desktop")).toBe(21);
  });

  it("fits a level to the nearest allowed one", () => {
    expect(fitLevel(31, "phone")).toBe(21);
    expect(fitLevel(16, "phone")).toBe(15);
    expect(fitLevel(19, "desktop")).toBe(19);
  });

  it("zooms one step and stops at the ends", () => {
    const view = makeView(17, { x: 50, y: 50 });
    expect(zoomView(view, 1, "phone").level).toBe(19);
    expect(zoomView(view, -1, "phone").level).toBe(15);
    expect(zoomView(makeView(15, { x: 50, y: 50 }), -1, "phone").level).toBe(15);
    expect(zoomView(makeView(21, { x: 50, y: 50 }), 1, "phone").level).toBe(21);
  });

  it("keeps the window on the board when zooming out near the edge", () => {
    const view = makeView(15, { x: 7, y: 93 });
    const zoomed = zoomView(view, 1, "phone");
    expect(zoomed.level).toBe(17);
    expect(zoomed).toMatchObject({ cx: 8, cy: 92 });
  });
});

describe("window", () => {
  it("clamps numbers and converts to screen coordinates", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(toScreen(50)).toBe(0);
    expect(toScreen(0)).toBe(-50);
    expect(toScreen(100)).toBe(50);
  });

  it("clamps the centre so the whole window lies on 0–100", () => {
    expect(clampView({ cx: -4, cy: 200, level: 15 })).toEqual({ cx: 7, cy: 93, level: 15 });
    expect(clampView({ cx: 50, cy: 50, level: 31 })).toEqual({ cx: 50, cy: 50, level: 31 });
  });

  it("computes the first coordinate and whether a point is visible", () => {
    expect(windowStart(50, 15)).toBe(43);
    const view = makeView(15, { x: 50, y: 50 });
    expect(isInWindow(view, { x: 43, y: 57 })).toBe(true);
    expect(isInWindow(view, { x: 42, y: 50 })).toBe(false);
    expect(isInWindow(view, { x: 50, y: 58 })).toBe(false);
  });

  it("pans by a fixed amount and by ⌊N/3⌋ with the arrows", () => {
    const view = makeView(15, { x: 50, y: 50 });
    expect(panStep(15)).toBe(5);
    expect(panStep(31)).toBe(10);
    expect(panView(view, 3, -2)).toMatchObject({ cx: 53, cy: 48 });
    expect(panByStep(view, { dx: 1, dy: 0 })).toMatchObject({ cx: 55, cy: 50 });
    expect(panByStep(view, { dx: 0, dy: -1 })).toMatchObject({ cx: 50, cy: 45 });
    expect(panByStep(makeView(15, { x: 95, y: 50 }), { dx: 1, dy: 0 }).cx).toBe(93);
  });

  it("centres on a point within the board", () => {
    expect(centerView(makeView(15, { x: 50, y: 50 }), { x: 2, y: 60 })).toMatchObject({ cx: 7, cy: 60 });
  });

  it("centres on the bounding box of the stones, the board middle when empty", () => {
    expect(stonesCenter([])).toEqual({ x: 50, y: 50 });
    expect(
      stonesCenter([
        { x: 48, y: 50 },
        { x: 53, y: 55 },
      ]),
    ).toEqual({ x: 51, y: 53 });
  });

  it("reveals a point with the smallest shift", () => {
    const view = makeView(15, { x: 50, y: 50 });
    expect(revealPoint(view, { x: 52, y: 48 })).toEqual(view);
    expect(revealPoint(view, { x: 60, y: 50 })).toMatchObject({ cx: 53, cy: 50 });
    expect(revealPoint(view, { x: 50, y: 30 })).toMatchObject({ cx: 50, cy: 37 });
  });
});

describe("selection and opponent marker", () => {
  it("moves the selection by one field and stops at the board edge", () => {
    expect(moveSelection({ x: 50, y: 50 }, { dx: 1, dy: 0 })).toEqual({ x: 51, y: 50 });
    expect(moveSelection({ x: 50, y: 50 }, { dx: 0, dy: -1 })).toEqual({ x: 50, y: 49 });
    expect(moveSelection({ x: 0, y: 100 }, { dx: -1, dy: 1 })).toEqual({ x: 0, y: 100 });
  });

  it("gives no direction for a visible point and the nearest edge direction otherwise", () => {
    const view = makeView(15, { x: 50, y: 50 });
    expect(offscreenDirection(view, { x: 50, y: 50 })).toBeNull();
    expect(offscreenDirection(view, { x: 70, y: 50 })).toEqual({ dx: 1, dy: 0 });
    expect(offscreenDirection(view, { x: 20, y: 52 })).toEqual({ dx: -1, dy: 0 });
    expect(offscreenDirection(view, { x: 50, y: 10 })).toEqual({ dx: 0, dy: -1 });
    expect(offscreenDirection(view, { x: 80, y: 90 })).toEqual({ dx: 1, dy: 1 });
  });
});

describe("drag", () => {
  const view = makeView(15, { x: 50, y: 50 });

  it("stays a tap below the 8 px threshold", () => {
    const drag = startDrag(view, 100, 100);
    const result = dragView(view, drag, 105, 105, 20);
    expect(result.drag.moved).toBe(false);
    expect(result.view).toBe(view);
  });

  it("becomes a drag at 8 px and moves the centre opposite to the pointer", () => {
    const drag = startDrag(view, 100, 100);
    const result = dragView(view, drag, 40, 130, 20);
    expect(result.drag.moved).toBe(true);
    expect(result.view).toMatchObject({ cx: 53, cy: 48 });
  });

  it("stays a drag after returning below the threshold", () => {
    const drag = startDrag(view, 100, 100);
    const first = dragView(view, drag, 140, 100, 20);
    const second = dragView(first.view, first.drag, 101, 100, 20);
    expect(second.drag.moved).toBe(true);
    expect(second.view).toMatchObject({ cx: 50, cy: 50 });
  });
});

describe("pinch", () => {
  it("spread zooms in, pinch zooms out, small changes nothing", () => {
    expect(pinchStep(100, 140)).toBe(1);
    expect(pinchStep(100, 70)).toBe(-1);
    expect(pinchStep(100, 110)).toBe(0);
    expect(pinchStep(0, 50)).toBe(0);
  });
});
