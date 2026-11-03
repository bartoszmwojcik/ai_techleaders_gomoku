import { turnColor, type GameColor, type GameReview, type GameVariant, type Seat } from "@gomoku/core";

import { cellName, colorOfSeat, outcomeOf, playerNameOf, sideWords, stonesOf, type Outcome, type PlacedStone } from "./play";

/** The stones on the board after `step` moves (0 = empty board). */
export function stonesAt(review: GameReview, step: number): PlacedStone[] {
  return stonesOf(review.moves.slice(0, step));
}

/** The cell of the last move shown at `step`, or `undefined` on the empty board. */
export function lastMoveAt(review: GameReview, step: number): number | undefined {
  return step === 0 ? undefined : review.moves[step - 1];
}

/** The winning line is only drawn when the last move is on screen (a five in a row can only be there). */
export function winLineAt(review: GameReview, step: number): number[] | undefined {
  return step === review.moves.length ? (review.result.winLine ?? undefined) : undefined;
}

const COLOR_WORD: Record<GameColor, string> = { black: "czarny", white: "biały" };

/** "Ruch 12 z 37: biały, kolumna F, rząd 8", "Początek partii" on the empty board. */
export function stepStatus(review: GameReview, step: number): string {
  const cell = lastMoveAt(review, step);
  if (cell === undefined) return "Początek partii — plansza jest pusta";
  return `Ruch ${step} z ${review.moves.length}: ${COLOR_WORD[turnColor(step - 1)]}, ${cellName(cell).replace(/^K/, "k")}`;
}

function seatName(review: Pick<GameReview, "players">, seat: Seat): string {
  return playerNameOf(review.players.find((player) => player.seat === seat)).label;
}

const NEUTRAL_DETAIL = {
  five_in_row: "Pięć kamieni w jednej linii.",
  timeout: "Przeciwnikowi skończył się czas.",
  resignation: "Przeciwnik poddał partię.",
  draw: "Plansza jest pełna, nikt nie ułożył pięciu kamieni.",
  points: "Wygrał wyższy wynik punktowy.",
} as const;

/** The review of a paper game has no sheet to step through yet: its moves are not in the classic log (E11). */
export const isPaperReview = (review: Pick<GameReview, "variant">): boolean => review.variant === "paper";

/**
 * The banner of the review. A reader who played hears it as on the game screen ("Wygrałeś"); a
 * reader who did not (`viewerSeat` null, the public games of E09-S02) hears who won, by colour and name.
 */
export function reviewOutcomeOf(review: GameReview): Outcome {
  if (review.viewerSeat !== null) {
    return outcomeOf({ result: review.result, you: { seat: review.viewerSeat } })!;
  }
  return neutralOutcomeOf(review);
}

/**
 * The banner for somebody who did not play (a reader with a code, a spectator): who won, by colour and
 * name, never "Wygrałeś". `result` is the finished game's result, `players` its seats.
 */
export function neutralOutcomeOf(game: {
  result: GameReview["result"] & { scores?: [number, number] };
  blackSeat: Seat;
  players: GameReview["players"];
  /** Names the sides: by colour (classic, the default) or by mark (paper). */
  variant?: GameVariant;
}): Outcome {
  const { winnerSeat, reason, scores } = game.result;
  if (winnerSeat === null) {
    return {
      result: "draw",
      title: scores ? `Remis ${scores[0]} : ${scores[1]}` : "Remis",
      detail: reason === "points" ? "Punkty były równe." : NEUTRAL_DETAIL.draw,
    };
  }
  const color = colorOfSeat(game.blackSeat, winnerSeat)!;
  // The winner's points first: "Wygrał krzyżyk: Ala · 7 : 5".
  const score = scores ? ` · ${scores[winnerSeat - 1]} : ${scores[2 - winnerSeat]}` : "";
  return { result: "win", title: `${sideWords(game.variant).wins[color]}: ${seatName(game, winnerSeat)}${score}`, detail: NEUTRAL_DETAIL[reason] };
}
