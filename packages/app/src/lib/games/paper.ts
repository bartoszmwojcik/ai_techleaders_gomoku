import { PAPER_CENTER, indexStones, refusalIn, type PaperIndex, type Seat } from "@gomoku/core";
import type { PaperBoardLabels, StoneColor } from "@gomoku/ui/game/paper-board";

import type { GameView } from "@/server/http/game-view";

import { PL_GAME, type GameTranslator } from "./play";

type Paper = NonNullable<GameView["paper"]>;
type Point = { x: number; y: number };

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

/** Texts of `PaperBoard` (the component has none of its own) in the reader's language. Coordinates are screen ones: the start is 0, 0. */
export function paperLabelsOf(t: GameTranslator): PaperBoardLabels {
  return {
    board: t("paper.board"),
    cell: ({ x, y, state, allowed, last, auto, selected }) =>
      [
        t("paper.cell", { x, y }),
        t(`paper.state.${state}`),
        state === "empty" && !allowed ? t("paper.tooFar") : "",
        last ? t("paper.last") : "",
        auto ? t("paper.auto") : "",
        selected ? t("paper.selected") : "",
      ]
        .filter(Boolean)
        .join(", "),
    notAllowed: t("paper.notAllowed"),
    autoMoved: ({ x, y }) => t("paper.autoMoved", { x, y }),
    opponentMarker: ({ dx, dy }) => t("paper.opponentMarker", { arrow: ARROWS[`${dx},${dy}`]! }),
    toolbar: t("paper.toolbar"),
    level: (level) => t("paper.level", { level }),
    zoomIn: t("paper.zoomIn"),
    zoomOut: t("paper.zoomOut"),
    center: t("paper.center"),
    panLeft: t("paper.panLeft"),
    panRight: t("paper.panRight"),
    panUp: t("paper.panUp"),
    panDown: t("paper.panDown"),
    selectionBar: t("paper.selectionBar"),
    selectionLeft: t("paper.selectionLeft"),
    selectionRight: t("paper.selectionRight"),
    selectionUp: t("paper.selectionUp"),
    selectionDown: t("paper.selectionDown"),
  };
}

export const PAPER_LABELS: PaperBoardLabels = paperLabelsOf(PL_GAME);

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
export function refusalText(rules: PaperRules, point: Point, t: GameTranslator = PL_GAME): string {
  const why = refusalIn(rules.index, point.x, point.y);
  if (why === null) return "";
  if (why === "CELL_OCCUPIED" || why === "FIRST_MOVE_CENTER" || why === "OFF_BOARD") return t(`paper.refusal.${why}`);
  return t("paper.refusal.TOO_FAR");
}
