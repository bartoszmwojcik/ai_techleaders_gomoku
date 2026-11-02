import { turnColor, type GameColor, type GameReview, type Seat } from "@gomoku/core";

import { cellName, colorOfSeat, outcomeOf, playerNameOf, stonesOf, type Outcome, type PlacedStone } from "./play";

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
const COLOR_WINS: Record<GameColor, string> = { black: "Wygrały czarne", white: "Wygrały białe" };

/** "Ruch 12 z 37: biały, kolumna F, rząd 8", "Początek partii" on the empty board. */
export function stepStatus(review: GameReview, step: number): string {
  const cell = lastMoveAt(review, step);
  if (cell === undefined) return "Początek partii — plansza jest pusta";
  return `Ruch ${step} z ${review.moves.length}: ${COLOR_WORD[turnColor(step - 1)]}, ${cellName(cell).replace(/^K/, "k")}`;
}

function seatName(review: GameReview, seat: Seat): string {
  return playerNameOf(review.players.find((player) => player.seat === seat)).label;
}

const NEUTRAL_DETAIL = {
  five_in_row: "Pięć kamieni w jednej linii.",
  timeout: "Przeciwnikowi skończył się czas.",
  resignation: "Przeciwnik poddał partię.",
  draw: "Plansza jest pełna, nikt nie ułożył pięciu kamieni.",
} as const;

/**
 * The banner of the review. A reader who played hears it as on the game screen ("Wygrałeś"); a
 * reader who did not (`viewerSeat` null, the public games of E09-S02) hears who won, by colour and name.
 */
export function reviewOutcomeOf(review: GameReview): Outcome {
  const { winnerSeat, reason } = review.result;
  if (review.viewerSeat !== null) {
    return outcomeOf({ result: review.result, you: { seat: review.viewerSeat } })!;
  }
  if (winnerSeat === null) return { result: "draw", title: "Remis", detail: NEUTRAL_DETAIL.draw };
  const color = colorOfSeat(review.blackSeat, winnerSeat)!;
  return { result: "win", title: `${COLOR_WINS[color]}: ${seatName(review, winnerSeat)}`, detail: NEUTRAL_DETAIL[reason] };
}

/** The colour as the legend names it: "Czarne: Ala". */
export const COLOR_TITLE: Record<GameColor, string> = { black: "Czarne", white: "Białe" };
