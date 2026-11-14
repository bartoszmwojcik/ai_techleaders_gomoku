import { turnColor, type GameColor, type GameReview, type GameVariant, type Seat } from "@gomoku/core";

import { coordsOf } from "@gomoku/core/games/board";

import plReview from "@/i18n/catalogs/pl/review";
import { textsOf, type TranslatorOf } from "@/i18n/client";

import { colorOfSeat, outcomeOf, PL_GAME, playerNameOf, sideWords, stonesOf, type GameTranslator, type Outcome, type PlacedStone } from "./play";
import { PL_COMMON, type CommonTranslator } from "./player-name";

export type ReviewTranslator = TranslatorOf<"review">;

export const PL_REVIEW: ReviewTranslator = textsOf<"review">(plReview);

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

/** "Ruch 12 z 37: biały, kolumna F, rząd 8", "Początek partii" on the empty board. */
export function stepStatus(review: GameReview, step: number, t: ReviewTranslator = PL_REVIEW): string {
  const cell = lastMoveAt(review, step);
  if (cell === undefined) return t("emptyBoard");
  const { x, y } = coordsOf(cell);
  const color: GameColor = turnColor(step - 1);
  return t("step", { step, total: review.moves.length, color: t(`color.${color}`), column: String.fromCharCode(65 + x), row: y + 1 });
}

function seatName(review: Pick<GameReview, "players">, seat: Seat, common: CommonTranslator): string {
  return playerNameOf(review.players.find((player) => player.seat === seat), common).label;
}

/** The review of a paper game has no sheet to step through yet: its moves are not in the classic log (E11). */
export const isPaperReview = (review: Pick<GameReview, "variant">): boolean => review.variant === "paper";

/**
 * The banner of the review. A reader who played hears it as on the game screen ("Wygrałeś"); a
 * reader who did not (`viewerSeat` null, the public games of E09-S02) hears who won, by colour and name.
 */
export function reviewOutcomeOf(review: GameReview, t: GameTranslator = PL_GAME, common: CommonTranslator = PL_COMMON): Outcome {
  if (review.viewerSeat !== null) {
    return outcomeOf({ result: review.result, you: { seat: review.viewerSeat } }, t)!;
  }
  return neutralOutcomeOf(review, t, common);
}

/**
 * The banner for somebody who did not play (a reader with a code, a spectator): who won, by colour and
 * name, never "Wygrałeś". `result` is the finished game's result, `players` its seats.
 */
export function neutralOutcomeOf(
  game: {
    result: GameReview["result"] & { scores?: [number, number] };
    blackSeat: Seat;
    players: GameReview["players"];
    /** Names the sides: by colour (classic, the default) or by mark (paper). */
    variant?: GameVariant;
  },
  t: GameTranslator = PL_GAME,
  common: CommonTranslator = PL_COMMON,
): Outcome {
  const { winnerSeat, reason, scores } = game.result;
  if (winnerSeat === null) {
    return {
      result: "draw",
      title: scores ? t("outcome.neutral.drawScore", { score: `${scores[0]} : ${scores[1]}` }) : t("outcome.draw"),
      detail: t(reason === "points" ? "outcome.neutral.pointsEqual" : "outcome.neutral.draw"),
    };
  }
  const color = colorOfSeat(game.blackSeat, winnerSeat)!;
  // The winner's points first: "Wygrał krzyżyk: Ala · 7 : 5".
  const score = scores ? t("outcome.neutral.score", { score: `${scores[winnerSeat - 1]} : ${scores[2 - winnerSeat]}` }) : "";
  return {
    result: "win",
    title: t("outcome.neutral.win", { wins: sideWords(game.variant, t).wins[color], name: seatName(game, winnerSeat, common), score }),
    detail: t(`outcome.neutral.${reason}`),
  };
}
