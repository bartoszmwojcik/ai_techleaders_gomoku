"use client";

import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Minus,
  Plus,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { crispLineWidth, watchDevicePixelRatio } from "./board-line-width";
import { cn } from "./cn";
import {
  centerView,
  dragView,
  fitLevel,
  isInWindow,
  levelsFor,
  makeView,
  moveSelection,
  offscreenDirection,
  PAPER_CENTER,
  PAPER_MAX,
  panByStep,
  parseStoredLevel,
  pinchStep,
  revealPoint,
  startDrag,
  stonesCenter,
  toScreen,
  windowStart,
  zoomView,
  type Direction,
  type Drag,
  type PaperLayout,
  type PaperView,
  type Point,
} from "./paper-board-view";

type Seat = 1 | 2;
type StoneColor = "black" | "white";
type PaperStone = Point & { seat: Seat; /** Placed by the automaton, not by a player. */ auto?: boolean };
/** A counted five, drawn as one pencil stroke from `from` to `to` (absolute coordinates). */
type PaperFive = { seat: Seat; from: Point; to: Point };
/** A cell as the screen reader meets it; `x`, `y` are screen coordinates (start = 0, 0). */
type PaperCellInfo = {
  x: number;
  y: number;
  state: "empty" | StoneColor;
  allowed: boolean;
  last: boolean;
  auto: boolean;
  selected: boolean;
};

type PaperBoardLabels = {
  /** Name of the whole board, e.g. "Plansza bez granic". */
  board: string;
  /** Names one cell, e.g. "Pole 3, −2, puste". */
  cell: (cell: PaperCellInfo) => string;
  /** Description of a field too far from every stone, e.g. "Za daleko od kamieni (najwyżej 3 pola)". */
  notAllowed: string;
  /** Live announcement of the automaton's move; the point is in screen coordinates. */
  autoMoved: (point: Point) => string;
  /** Text of the off-screen opponent marker, e.g. "Ruch przeciwnika →". */
  opponentMarker: (direction: Direction) => string;
  /** Name of the navigation toolbar. */
  toolbar: string;
  /** Current zoom level, e.g. "15 × 15". */
  level: (level: number) => string;
  zoomIn: string;
  zoomOut: string;
  /** Visible text of the button that centres the view, e.g. "Wyśrodkuj". */
  center: string;
  panLeft: string;
  panRight: string;
  panUp: string;
  panDown: string;
  /** Name of the touch bar under the board. */
  selectionBar: string;
  selectionLeft: string;
  selectionRight: string;
  selectionUp: string;
  selectionDown: string;
};

type PaperBoardProps = {
  stones: readonly PaperStone[];
  /** Stone colour of each seat. */
  colors: Record<Seat, StoneColor>;
  /** Counted fives, drawn with a pencil stroke. */
  fives?: readonly PaperFive[];
  /** The last stone placed (marked with an outline). */
  lastMove?: Point;
  /** The opponent's last stone; when it is off-screen a direction marker appears on the edge. */
  opponentMove?: Point;
  /** The field picked and waiting for confirmation (dashed outline); the parent owns the second step. */
  selection?: Point;
  /** Seat whose colour the selection preview uses. Default 1. */
  selectionSeat?: Seat;
  /** Runs when the player picks an allowed empty field (click, Enter, Space) or moves the selection with the touch bar. */
  onSelect?: (point: Point) => void;
  /** Fields where a stone may go, as a predicate or a list; fields outside are inactive. Omit for "everywhere". */
  allowed?: ((point: Point) => boolean) | readonly Point[];
  /** Finished game or opponent's turn: the board can be read and moved around but nothing is picked. */
  disabled?: boolean;
  labels: PaperBoardLabels;
  /** Overrides the detection (coarse pointer or narrow screen = phone) of levels, default zoom and touch bar. */
  layout?: PaperLayout;
  /** Show the touch bar under the board. Default: on a phone. */
  selectionBar?: boolean;
  /** Show the toolbar above the board (window arrows, centre, zoom on desktop). Default true. */
  toolbar?: boolean;
  /** Changing the value centres the view on the stones (start of the game, after the player's own move). */
  recenterToken?: string | number;
  /** Key of the zoom level in localStorage. */
  storageKey?: string;
  className?: string;
};

const DEFAULT_STORAGE_KEY = "gomoku.paper-board.level";
const PHONE_QUERY = "(pointer: coarse), (max-width: 480px)";

const ARROW_ICONS: Record<string, LucideIcon> = {
  "-1,-1": ArrowUpLeft,
  "0,-1": ArrowUp,
  "1,-1": ArrowUpRight,
  "-1,0": ArrowLeft,
  "1,0": ArrowRight,
  "-1,1": ArrowDownLeft,
  "0,1": ArrowDown,
  "1,1": ArrowDownRight,
};
const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};
const MARKER_X = { "-1": "left-1", "0": "left-1/2 -translate-x-1/2", "1": "right-1" } as const;
const MARKER_Y = { "-1": "top-1", "0": "top-1/2 -translate-y-1/2", "1": "bottom-1" } as const;

const TOOL_BUTTON =
  "inline-flex size-(--target-min) shrink-0 items-center justify-center rounded-base border border-border-control bg-transparent text-text-primary hover:bg-surface-raised active:bg-border-default focus-visible:focus-ring disabled:cursor-not-allowed disabled:text-text-muted [&_svg]:size-(--icon-size-md)";

const keyOf = ({ x, y }: Point) => `${x},${y}`;

const hasMatchMedia = () => typeof window.matchMedia === "function";

/** Browser preferences as one comparable string: "<phone|desktop>|<stored level or empty>". */
function readPreferences(key: string): string {
  let stored = "";
  try {
    stored = window.localStorage.getItem(key) ?? "";
  } catch {
    // Storage is blocked (private mode): the default level applies.
  }
  const phone = hasMatchMedia() && window.matchMedia(PHONE_QUERY).matches;
  return `${phone ? "phone" : "desktop"}|${stored}`;
}

function subscribePreferences(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function storeLevel(key: string, level: number) {
  try {
    window.localStorage.setItem(key, String(level));
  } catch {
    // Storage is a convenience only (private mode, blocked cookies).
  }
}

function PaperBoard({
  stones,
  colors,
  fives = [],
  lastMove,
  opponentMove,
  selection,
  selectionSeat = 1,
  onSelect,
  allowed,
  disabled = false,
  labels,
  layout: layoutProp,
  selectionBar,
  toolbar = true,
  recenterToken,
  storageKey = DEFAULT_STORAGE_KEY,
  className,
}: PaperBoardProps) {
  const describedBy = useId();
  // Server and first client paint use "desktop|" (no storage, no media query); the client then reads the real values.
  const preferences = useSyncExternalStore(
    subscribePreferences,
    () => readPreferences(storageKey),
    () => "desktop|",
  );
  const [detectedLayout, storedLevel = ""] = preferences.split("|") as [PaperLayout, string?];
  const layout = layoutProp ?? detectedLayout;
  const showBar = selectionBar ?? layout === "phone";
  const [center, setCenter] = useState<Point>(() => stonesCenter(stones));
  const [levelChoice, setLevelChoice] = useState<number>();
  const view = makeView(levelChoice === undefined ? parseStoredLevel(storedLevel || null, layout) : fitLevel(levelChoice, layout), center);
  function setView(next: PaperView) {
    setCenter({ x: next.cx, y: next.cy });
    if (next.level === view.level) return;
    setLevelChoice(next.level);
    storeLevel(storageKey, next.level);
  }
  const [focus, setFocus] = useState<Point>(lastMove ?? { x: PAPER_CENTER, y: PAPER_CENTER });
  const [lineWidth, setLineWidth] = useState<string>();
  const [seenToken, setSeenToken] = useState(recenterToken);
  const [seenSelection, setSeenSelection] = useState(selection && keyOf(selection));

  const frame = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const drag = useRef<Drag | null>(null);
  const pinchStart = useRef(0);
  const suppressClick = useRef(false);

  useEffect(() => watchDevicePixelRatio((ratio) => setLineWidth(crispLineWidth(ratio))), []);

  // Props that move the view are handled while rendering (no effect, no flash of the old window).
  if (recenterToken !== seenToken) {
    setSeenToken(recenterToken);
    setView(centerView(view, stonesCenter(stones)));
  }
  const selectionKey = selection && keyOf(selection);
  if (selectionKey !== seenSelection) {
    setSeenSelection(selectionKey);
    if (selection) setView(revealPoint(view, selection));
  }

  function changeLevel(step: 1 | -1) {
    setView(zoomView(view, step, layout));
  }
  // Re-registered after every render so the handler always sees the current view.
  useEffect(() => {
    const element = frame.current as HTMLDivElement;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeLevel(event.deltaY < 0 ? -1 : 1);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  });

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    (buttons.current.get(keyOf(focus)) as HTMLButtonElement).focus();
  }, [view, focus]);

  const stoneAt = new Map(stones.map((stone) => [keyOf(stone), stone]));
  const allowedSet = Array.isArray(allowed) ? new Set((allowed as readonly Point[]).map(keyOf)) : null;
  const restricted = allowed !== undefined;
  const isAllowed = (point: Point) =>
    !restricted ? true : allowedSet ? allowedSet.has(keyOf(point)) : (allowed as (point: Point) => boolean)(point);
  const lastStone = lastMove && stoneAt.get(keyOf(lastMove));

  const x0 = windowStart(view.cx, view.level);
  const y0 = windowStart(view.cy, view.level);
  const tabStop = isInWindow(view, focus) ? focus : { x: view.cx, y: view.cy };

  function pick(point: Point) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!disabled && !stoneAt.has(keyOf(point)) && isAllowed(point)) onSelect?.(point);
  }

  function onGridKeyDown(event: KeyboardEvent) {
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    const next = moveSelection(tabStop, direction);
    pendingFocus.current = true;
    setFocus(next);
    setView(revealPoint(view, next));
  }

  function onPointerDown(event: PointerEvent) {
    suppressClick.current = false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      drag.current = startDrag(view, event.clientX, event.clientY);
      return;
    }
    drag.current = null;
    const [first, second] = [...pointers.current.values()] as [Point, Point];
    pinchStart.current = Math.hypot(first.x - second.x, first.y - second.y);
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()] as [Point, Point];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const step = pinchStep(pinchStart.current, distance);
      suppressClick.current = true;
      if (step !== 0) {
        pinchStart.current = distance;
        changeLevel(step === 1 ? -1 : 1);
      }
      return;
    }
    if (!drag.current) return;
    const cellSize = Math.max(1, (frame.current as HTMLDivElement).getBoundingClientRect().width / view.level);
    const result = dragView(view, drag.current, event.clientX, event.clientY, cellSize);
    drag.current = result.drag;
    if (result.drag.moved) suppressClick.current = true;
    setView(result.view);
  }

  function onPointerEnd(event: PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) drag.current = null;
  }

  const selectionOrigin = selection ?? lastMove ?? { x: PAPER_CENTER, y: PAPER_CENTER };
  const marker = opponentMove ? offscreenDirection(view, opponentMove) : null;
  const MarkerIcon = marker ? (ARROW_ICONS[`${marker.dx},${marker.dy}`] as LucideIcon) : null;

  const panButtons: { direction: Direction; label: string }[] = [
    { direction: { dx: -1, dy: 0 }, label: labels.panLeft },
    { direction: { dx: 0, dy: -1 }, label: labels.panUp },
    { direction: { dx: 0, dy: 1 }, label: labels.panDown },
    { direction: { dx: 1, dy: 0 }, label: labels.panRight },
  ];
  const selectionButtons: { direction: Direction; label: string }[] = [
    { direction: { dx: -1, dy: 0 }, label: labels.selectionLeft },
    { direction: { dx: 0, dy: -1 }, label: labels.selectionUp },
    { direction: { dx: 0, dy: 1 }, label: labels.selectionDown },
    { direction: { dx: 1, dy: 0 }, label: labels.selectionRight },
  ];
  const zoomButtons = (
    <>
      <button type="button" className={TOOL_BUTTON} aria-label={labels.zoomOut} disabled={view.level >= (levelsFor(layout).at(-1) as number)} onClick={() => changeLevel(1)}>
        <Minus aria-hidden="true" />
      </button>
      <button type="button" className={TOOL_BUTTON} aria-label={labels.zoomIn} disabled={view.level <= (levelsFor(layout)[0] as number)} onClick={() => changeLevel(-1)}>
        <Plus aria-hidden="true" />
      </button>
    </>
  );

  return (
    <div className={cn("flex w-full max-w-(--layout-width-board) flex-col gap-2", className)}>
      {toolbar && (
        <div role="toolbar" aria-label={labels.toolbar} className="flex flex-wrap items-center gap-1">
          {panButtons.map(({ direction, label }) => {
            const Icon = ARROW_ICONS[`${direction.dx},${direction.dy}`] as LucideIcon;
            return (
              <button key={label} type="button" className={TOOL_BUTTON} aria-label={label} onClick={() => setView(panByStep(view, direction))}>
                <Icon aria-hidden="true" />
              </button>
            );
          })}
          <button
            type="button"
            className={cn(TOOL_BUTTON, "px-3 text-body")}
            onClick={() => setView(centerView(view, lastMove ?? stonesCenter(stones)))}
          >
            {labels.center}
          </button>
          {!showBar && zoomButtons}
          <span aria-live="polite" className="ml-auto text-meta text-text-muted">
            {labels.level(view.level)}
          </span>
        </div>
      )}
      <div
        style={lineWidth ? ({ "--board-line-width": lineWidth } as CSSProperties) : undefined}
        className="board-texture rounded-base bg-board-surface p-(--board-padding) shadow-board"
      >
        <div
          ref={frame}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
          className="relative touch-none select-none"
        >
          <div
            role="grid"
            aria-label={labels.board}
            aria-readonly={disabled || undefined}
            onKeyDown={onGridKeyDown}
            style={{ gridTemplateColumns: `repeat(${view.level}, minmax(0, 1fr))` }}
            className="grid"
          >
            {Array.from({ length: view.level }, (_, row) => {
              const y = y0 + row;
              return (
                <div role="row" key={y} className="contents">
                  {Array.from({ length: view.level }, (_, column) => {
                    const point = { x: x0 + column, y };
                    const key = keyOf(point);
                    const stone = stoneAt.get(key);
                    const isSelected = selection !== undefined && keyOf(selection) === key;
                    const canPlace = isAllowed(point);
                    const color = stone ? colors[stone.seat] : undefined;
                    const shown = color ?? (isSelected ? colors[selectionSeat] : undefined);
                    const last = lastMove !== undefined && keyOf(lastMove) === key;
                    const edgeX = point.x === 0 || point.x === PAPER_MAX;
                    const edgeY = point.y === 0 || point.y === PAPER_MAX;
                    const inactive = Boolean(stone) || !canPlace;
                    return (
                      <div
                        role="gridcell"
                        key={key}
                        className={cn(
                          "relative aspect-square before:absolute before:top-1/2 before:bg-board-line after:absolute after:left-1/2 after:bg-board-line",
                          point.x === 0 ? "before:right-0 before:left-1/2" : point.x === PAPER_MAX ? "before:right-1/2 before:left-0" : "before:inset-x-0",
                          point.y === 0 ? "after:top-1/2 after:bottom-0" : point.y === PAPER_MAX ? "after:top-0 after:bottom-1/2" : "after:inset-y-0",
                          edgeY ? "before:h-[calc(var(--board-line-width)*3)]" : "before:h-(--board-line-width)",
                          edgeX ? "after:w-[calc(var(--board-line-width)*3)]" : "after:w-(--board-line-width)",
                          restricted && canPlace && !stone && "bg-paper-allowed",
                        )}
                      >
                        <button
                          type="button"
                          ref={(element) => {
                            if (element) buttons.current.set(key, element);
                            else buttons.current.delete(key);
                          }}
                          tabIndex={keyOf(tabStop) === key ? 0 : -1}
                          aria-label={labels.cell({
                            x: toScreen(point.x),
                            y: toScreen(point.y),
                            state: color ?? "empty",
                            allowed: canPlace,
                            last,
                            auto: Boolean(stone?.auto),
                            selected: isSelected,
                          })}
                          aria-disabled={inactive || disabled ? true : undefined}
                          aria-describedby={!stone && !canPlace ? describedBy : undefined}
                          onFocus={() => setFocus(point)}
                          onClick={() => pick(point)}
                          className="absolute inset-0 z-10 flex items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-piece-outline"
                        >
                          {shown && (
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex size-(--piece-size) items-center justify-center rounded-piece border border-piece-outline shadow-piece",
                                shown === "black" ? "bg-piece-black" : "bg-piece-white",
                                !stone && "border-2 border-dashed",
                                last && "outline-2 outline-offset-2 outline-board-marker",
                                stone?.auto && !last && "outline-2 outline-dashed outline-offset-2 outline-board-marker",
                              )}
                            >
                              {stone?.auto && <span className="size-1/4 rounded-piece bg-paper-auto" />}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <svg aria-hidden="true" viewBox={`0 0 ${view.level} ${view.level}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
            {fives.map(({ seat, from, to }) => {
              const length = Math.max(Math.hypot(to.x - from.x, to.y - from.y), 1);
              const ux = ((to.x - from.x) / length) * 0.3;
              const uy = ((to.y - from.y) / length) * 0.3;
              return (
                <line
                  key={`${seat}:${keyOf(from)}:${keyOf(to)}`}
                  data-seat={seat}
                  x1={from.x - x0 + 0.5 - ux}
                  y1={from.y - y0 + 0.5 - uy}
                  x2={to.x - x0 + 0.5 + ux}
                  y2={to.y - y0 + 0.5 + uy}
                  strokeWidth={0.14}
                  strokeLinecap="round"
                  className="stroke-paper-pencil"
                />
              );
            })}
          </svg>
          {marker && MarkerIcon && opponentMove && (
            <button
              type="button"
              onClick={() => setView(centerView(view, opponentMove))}
              className={cn(
                "absolute z-20 inline-flex min-h-target items-center gap-1 rounded-base border border-border-control bg-surface-raised px-2 text-meta text-text-primary focus-visible:focus-ring",
                MARKER_X[`${marker.dx}`],
                MARKER_Y[`${marker.dy}`],
              )}
            >
              <MarkerIcon aria-hidden="true" className="size-(--icon-size-md)" />
              {labels.opponentMarker(marker)}
            </button>
          )}
        </div>
      </div>
      <span id={describedBy} className="sr-only">
        {labels.notAllowed}
      </span>
      <p role="status" className="sr-only">
        {lastStone?.auto && lastMove ? labels.autoMoved({ x: toScreen(lastMove.x), y: toScreen(lastMove.y) }) : ""}
      </p>
      {showBar && (
        <div role="group" aria-label={labels.selectionBar} className="mx-auto flex w-fit gap-1">
          {selectionButtons.map(({ direction, label }) => {
            const Icon = ARROW_ICONS[`${direction.dx},${direction.dy}`] as LucideIcon;
            return (
              <button
                key={label}
                type="button"
                className={TOOL_BUTTON}
                aria-label={label}
                disabled={disabled}
                onClick={() => onSelect?.(moveSelection(selectionOrigin, direction))}
              >
                <Icon aria-hidden="true" />
              </button>
            );
          })}
          {zoomButtons}
        </div>
      )}
    </div>
  );
}

export { PaperBoard };
export type { PaperBoardLabels, PaperBoardProps, PaperCellInfo, PaperFive, PaperStone, Seat, StoneColor };
export { PAPER_CENTER, PAPER_MAX };
export type { Direction, PaperLayout, PaperView, Point };
