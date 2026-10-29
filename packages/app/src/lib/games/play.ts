import { coordsOf } from "@gomoku/core/games/board";
import { turnColor } from "@gomoku/core/games/rules";
import type { GameColor, Seat } from "@gomoku/core/games/types";

import type { GameView } from "@/server/http/game-view";

/** A stone for the board component: moves alternate, black first (#22 Q1). */
export type PlacedStone = { cell: number; color: GameColor };

export function stonesOf(moves: readonly number[]): PlacedStone[] {
  return moves.map((cell, index) => ({ cell, color: turnColor(index) }));
}

/**
 * Puts a state read with `?after=<after>` on top of the one the client holds. The server sends
 * only the moves after the first `after`, so the known ones are kept and the new ones appended.
 * A stale response (older than what the client holds) never moves the board back.
 */
export function mergeState(current: GameView, next: GameView, after: number): GameView {
  if (next.moveCount < current.moves.length) return current;
  return { ...next, moves: [...current.moves.slice(0, after), ...next.moves] };
}

/** Body of `POST /api/games/[id]/moves` for a cell (#22 Q4); `moveNumber` is `moveCount + 1` of the state the player saw. */
export function moveOf(cell: number, moveNumber: number) {
  return { ...coordsOf(cell), moveNumber };
}

/** The colour a seat plays, or `null` before the draw (a waiting game). */
export function colorOfSeat(blackSeat: Seat | null, seat: Seat): GameColor | null {
  if (blackSeat === null) return null;
  return blackSeat === seat ? "black" : "white";
}

export const COLOR_NAME: Record<GameColor, string> = { black: "czarne", white: "białe" };
/** "Grasz czarnymi". */
export const COLOR_PLAYS: Record<GameColor, string> = { black: "czarnymi", white: "białymi" };

const COLUMN_STATE = { empty: "puste", black: "czarny kamień", white: "biały kamień" } as const;

/** "Kolumna C, rząd 7, puste". */
export function cellLabel({ column, row, state }: { column: string; row: number; state: keyof typeof COLUMN_STATE }) {
  return `Kolumna ${column}, rząd ${row}, ${COLUMN_STATE[state]}`;
}

/** "Kolumna C, rząd 7" for a cell index. */
export function cellName(cell: number): string {
  const { x, y } = coordsOf(cell);
  return `Kolumna ${String.fromCharCode(65 + x)}, rząd ${y + 1}`;
}

export function playerName(player: GameView["players"][number] | undefined): string {
  return player?.kind === "guest" ? "Gość" : (player?.displayName ?? "Usunięty gracz");
}

export type Outcome = { result: "win" | "loss" | "draw"; title: string; detail: string };

/** The banner of a finished game from the point of view of the viewer (p06.1, p06.2, p06.4; texts of the prototype). */
export function outcomeOf(game: GameView): Outcome | null {
  const { result } = game;
  if (!result) return null;
  if (result.reason === "draw") {
    return { result: "draw", title: "Remis", detail: "Plansza jest pełna, nikt nie ułożył pięciu kamieni." };
  }
  const won = result.winnerSeat === game.you.seat;
  switch (result.reason) {
    case "five_in_row":
      return won
        ? { result: "win", title: "Wygrałeś", detail: "Ułożyłeś pięć kamieni w jednej linii." }
        : { result: "loss", title: "Przegrałeś", detail: "Przeciwnik ułożył pięć kamieni w jednej linii." };
    case "timeout":
      return won
        ? { result: "win", title: "Wygrałeś — przeciwnikowi skończył się czas", detail: "" }
        : { result: "loss", title: "Przegrałeś — skończył się Twój czas", detail: "" };
    case "resignation":
      return won
        ? { result: "win", title: "Wygrałeś, przeciwnik poddał partię", detail: "" }
        : { result: "loss", title: "Przegrałeś, poddałeś partię", detail: "" };
  }
}
