// Pure view logic of PaperBoard (spec 2026-11-02-paper-pencil-gomoku, "Plansza PaperBoard").
// Coordinates are absolute (0..100); the screen shows them relative to the start (50 = 0).

export const PAPER_MAX = 100;
export const PAPER_CENTER = 50;
/** Pointer travel (px) below which a press is a tap, not a drag. */
export const DRAG_THRESHOLD = 8;
/** Distance ratio between two fingers that switches one zoom level. */
export const PINCH_RATIO = 1.3;

export const PHONE_LEVELS: readonly number[] = [15, 17, 19, 21];
export const DESKTOP_LEVELS: readonly number[] = [15, 17, 19, 21, 23, 25, 27, 29, 31];
export const PHONE_DEFAULT_LEVEL = 15;
export const DESKTOP_DEFAULT_LEVEL = 21;

export type PaperLayout = "phone" | "desktop";
export type Point = { x: number; y: number };
/** The window centre; the window never leaves the board. */
export type PaperView = { cx: number; cy: number; level: number };
export type Direction = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };
export type Drag = {
  startX: number;
  startY: number;
  origin: Point;
  moved: boolean;
};

export const levelsFor = (layout: PaperLayout): readonly number[] => (layout === "phone" ? PHONE_LEVELS : DESKTOP_LEVELS);
export const defaultLevel = (layout: PaperLayout): number => (layout === "phone" ? PHONE_DEFAULT_LEVEL : DESKTOP_DEFAULT_LEVEL);

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Screen coordinate (relative to the start) of an absolute one. */
export const toScreen = (absolute: number): number => absolute - PAPER_CENTER;

/** A level read from storage: valid for the layout, otherwise the layout default. */
export function parseStoredLevel(raw: string | null, layout: PaperLayout): number {
  const level = Number(raw);
  return raw !== null && levelsFor(layout).includes(level) ? level : defaultLevel(layout);
}

/** A level that is valid for the layout: the nearest allowed one (a phone cannot keep 31). */
export function fitLevel(level: number, layout: PaperLayout): number {
  const levels = levelsFor(layout);
  return levels.reduce((best, candidate) => (Math.abs(candidate - level) < Math.abs(best - level) ? candidate : best));
}

/** Moves the centre so the whole window lies on the board. */
export function clampView(view: PaperView): PaperView {
  const half = Math.floor(view.level / 2);
  return {
    ...view,
    cx: clamp(view.cx, half, PAPER_MAX - half),
    cy: clamp(view.cy, half, PAPER_MAX - half),
  };
}

export const makeView = (level: number, center: Point): PaperView => clampView({ level, cx: center.x, cy: center.y });

/** First absolute coordinate shown in the window along one axis. */
export const windowStart = (center: number, level: number): number => center - Math.floor(level / 2);

export function isInWindow(view: PaperView, point: Point): boolean {
  const half = Math.floor(view.level / 2);
  return Math.abs(point.x - view.cx) <= half && Math.abs(point.y - view.cy) <= half;
}

/** One zoom step: `1` shows more fields (zoom out), `-1` fewer (zoom in). Stays within the levels. */
export function zoomView(view: PaperView, step: 1 | -1, layout: PaperLayout): PaperView {
  const levels = levelsFor(layout);
  const index = levels.indexOf(view.level) + step;
  const level = levels[clamp(index, 0, levels.length - 1)] as number;
  return clampView({ ...view, level });
}

/** How far the arrows move the window. */
export const panStep = (level: number): number => Math.floor(level / 3);

export function panView(view: PaperView, dx: number, dy: number): PaperView {
  return clampView({ ...view, cx: view.cx + dx, cy: view.cy + dy });
}

export const panByStep = (view: PaperView, direction: Direction): PaperView =>
  panView(view, direction.dx * panStep(view.level), direction.dy * panStep(view.level));

export const centerView = (view: PaperView, point: Point): PaperView => clampView({ ...view, cx: point.x, cy: point.y });

/** Centre of the bounding box of the stones; the middle of the board when there are none. */
export function stonesCenter(stones: readonly Point[]): Point {
  if (stones.length === 0) return { x: PAPER_CENTER, y: PAPER_CENTER };
  const xs = stones.map(({ x }) => x);
  const ys = stones.map(({ y }) => y);
  return {
    x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
  };
}

/** Moves the window by the least amount that shows the point. */
export function revealPoint(view: PaperView, point: Point): PaperView {
  const half = Math.floor(view.level / 2);
  return clampView({
    ...view,
    cx: clamp(view.cx, point.x - half, point.x + half),
    cy: clamp(view.cy, point.y - half, point.y + half),
  });
}

/** The selection moved one field; stays on the board. */
export function moveSelection(selection: Point, direction: Direction): Point {
  return {
    x: clamp(selection.x + direction.dx, 0, PAPER_MAX),
    y: clamp(selection.y + direction.dy, 0, PAPER_MAX),
  };
}

/** Direction to a point outside the window (towards the nearest edge), `null` when it is visible. */
export function offscreenDirection(view: PaperView, point: Point): Direction | null {
  if (isInWindow(view, point)) return null;
  const half = Math.floor(view.level / 2);
  const sign = (delta: number): -1 | 0 | 1 => (Math.abs(delta) <= half ? 0 : delta < 0 ? -1 : 1);
  return { dx: sign(point.x - view.cx), dy: sign(point.y - view.cy) };
}

export const startDrag = (view: PaperView, x: number, y: number): Drag => ({
  startX: x,
  startY: y,
  origin: { x: view.cx, y: view.cy },
  moved: false,
});

/**
 * A pointer moved while pressed. Below the threshold nothing changes; once passed, the drag stays a
 * drag and the window follows the pointer (content follows the finger, so the centre moves opposite).
 */
export function dragView(
  view: PaperView,
  drag: Drag,
  x: number,
  y: number,
  cellSize: number,
): { view: PaperView; drag: Drag } {
  const deltaX = x - drag.startX;
  const deltaY = y - drag.startY;
  const moved = drag.moved || Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD;
  if (!moved) return { view, drag };
  return {
    drag: { ...drag, moved },
    view: clampView({
      ...view,
      cx: drag.origin.x - Math.round(deltaX / cellSize),
      cy: drag.origin.y - Math.round(deltaY / cellSize),
    }),
  };
}

/** Two fingers: `1` spread (zoom in, fewer fields), `-1` pinched, `0` not enough change yet. */
export function pinchStep(startDistance: number, distance: number): 1 | -1 | 0 {
  if (startDistance <= 0) return 0;
  const ratio = distance / startDistance;
  if (ratio >= PINCH_RATIO) return 1;
  if (ratio <= 1 / PINCH_RATIO) return -1;
  return 0;
}
