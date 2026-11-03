import { PAPER_CENTER, indexStones, refusalIn, type PaperIndex, type Seat } from "@gomoku/core";
import type { PaperBoardLabels, StoneColor } from "@gomoku/ui/game/paper-board";

import type { GameView } from "@/server/http/game-view";

type Paper = NonNullable<GameView["paper"]>;
type Point = { x: number; y: number };

const STATE_WORD = { empty: "puste", black: "krzyżyk", white: "kółko" } as const;
const ARROWS: Record<string, string> = {
  "-1,-1": "↖",
  "0,-1": "↑",
  "1,-1": "↗",
  "-1,0": "←",
  "1,0": "→",
  "-1,1": "↙",
  "0,1": "↓",
  "1,1": "↘",
};

/** Texts of `PaperBoard` (the component has none of its own). Coordinates are screen ones: the start is 0, 0. */
export const PAPER_LABELS: PaperBoardLabels = {
  board: "Plansza bez granic, papier i ołówek",
  cell: ({ x, y, state, allowed, last, auto, selected }) =>
    [
      `Pole ${x}, ${y}`,
      STATE_WORD[state],
      state === "empty" && !allowed ? "za daleko od znaków" : "",
      last ? "ostatni ruch" : "",
      auto ? "postawiony przez automat" : "",
      selected ? "zaznaczone" : "",
    ]
      .filter(Boolean)
      .join(", "),
  notAllowed: "Za daleko od znaków: znak można postawić najwyżej 3 pola od innego.",
  autoMoved: ({ x, y }) => `Automat postawił znak na polu ${x}, ${y}`,
  opponentMarker: ({ dx, dy }) => `Ruch przeciwnika ${ARROWS[`${dx},${dy}`]}`,
  toolbar: "Przesuwanie i powiększanie planszy",
  level: (level) => `${level} × ${level} pól`,
  zoomIn: "Przybliż",
  zoomOut: "Oddal",
  center: "Wyśrodkuj",
  panLeft: "Przesuń widok w lewo",
  panRight: "Przesuń widok w prawo",
  panUp: "Przesuń widok w górę",
  panDown: "Przesuń widok w dół",
  selectionBar: "Przesuwanie zaznaczenia",
  selectionLeft: "Zaznaczenie w lewo",
  selectionRight: "Zaznaczenie w prawo",
  selectionUp: "Zaznaczenie w górę",
  selectionDown: "Zaznaczenie w dół",
};

/** The side of each seat (black plays ×, white plays ○); before the draw (`blackSeat` null) the seats take the default order. */
export function paperColors(blackSeat: Seat | null): Record<Seat, StoneColor> {
  return blackSeat === 2 ? { 1: "white", 2: "black" } : { 1: "black", 2: "white" };
}

export const lastPaperMove = (paper: Paper): Point | undefined => paper.moves.at(-1);

/** The last stone that is not the viewer's: the opponent's, or the automat's when it plays for the opponent. */
export function opponentPaperMove(paper: Paper, seat: Seat): Point | undefined {
  return paper.moves.findLast((move) => move.seat !== seat);
}

/** The first stone of the game goes in the middle: the selection starts there. */
export const FIRST_STONE: Point = { x: PAPER_CENTER, y: PAPER_CENTER };

export type PaperRules = { index: PaperIndex; allowed: (point: Point) => boolean };

/** Rules of the sheet for the stones on it: one occupancy index, then a cheap check per field (BR-47). */
export function paperRules(stones: readonly { x: number; y: number; seat: Seat; auto: boolean }[]): PaperRules {
  const index = indexStones(stones);
  return { index, allowed: ({ x, y }) => refusalIn(index, x, y) === null };
}

/** Why the selected field cannot take a stone, in words ("" when it can). */
export function refusalText(rules: PaperRules, point: Point): string {
  const why = refusalIn(rules.index, point.x, point.y);
  if (why === null) return "";
  if (why === "CELL_OCCUPIED") return "To pole jest już zajęte.";
  if (why === "FIRST_MOVE_CENTER") return "Pierwszy znak trafia na środek planszy.";
  if (why === "OFF_BOARD") return "To pole jest poza planszą.";
  return "Za daleko od znaków: najwyżej 3 pola od innego.";
}
