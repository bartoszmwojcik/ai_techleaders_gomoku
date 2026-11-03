import type { PaperStone } from "./board";
import { scoreGame, type Five } from "./scoring";

/** A stored move of the paper game; `atMs` is when it was played (an automat stone: when it was due). */
export type PaperMoveRow = { n: number; x: number; y: number; seat: 1 | 2; auto: boolean; atMs: number };

/** What the server stores about a paper game's sheet (`paper_game_states` + `paper_moves`). */
export type PaperSnapshot = {
  moveCount: number;
  autoSeat: 1 | 2 | null;
  pendingAutoAtMs: number | null;
  moves: readonly PaperMoveRow[];
};

/** What the API tells a client about the sheet (E11 API Contracts). */
export type PaperView = {
  moveCount: number;
  /** The moves after the first `after` ones. */
  moves: { n: number; x: number; y: number; seat: 1 | 2; auto: boolean; at: string }[];
  scores: [number, number];
  fives: Five[];
  autoSeat: 1 | 2 | null;
  /** When the automat puts its next stone, or `null`. */
  autoMoveAt: string | null;
};

export const stonesOf = (moves: readonly PaperMoveRow[]): PaperStone[] =>
  moves.map(({ x, y, seat, auto }) => ({ x, y, seat, auto }));

/** The sheet part of the game state for a client that already knows the first `after` moves. */
export function paperView(snapshot: PaperSnapshot, after: number): PaperView {
  const { scores, fives } = scoreGame(stonesOf(snapshot.moves));
  return {
    moveCount: snapshot.moveCount,
    moves: snapshot.moves
      .filter((move) => move.n > after)
      .map(({ n, x, y, seat, auto, atMs }) => ({ n, x, y, seat, auto, at: new Date(atMs).toISOString() })),
    scores,
    fives,
    autoSeat: snapshot.autoSeat,
    autoMoveAt: snapshot.pendingAutoAtMs === null ? null : new Date(snapshot.pendingAutoAtMs).toISOString(),
  };
}
