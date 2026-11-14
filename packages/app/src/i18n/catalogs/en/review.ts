import type { Translation } from "../types";

const review: Translation<"review"> = {
  meta: { title: "Game review — Gomoku" },
  heading: "Game review",
  banner: "{reason}. {detail}",
  finishedAt: "Finished: {date}",
  players: "Players",
  playerLine: "{side}: ",
  paperTitle: "The move-by-move view is not available",
  paperBody: "This game was played in the “Pen and paper” variant. The result and the players are above.",
  steps: "Stepping through the moves",
  start: "Start",
  previous: "Previous",
  next: "Next",
  end: "End",
  emptyBoard: "Start of the game — the board is empty",
  step: "Move {step} of {total}: {color}, column {column}, row {row}",
  color: { black: "black", white: "white" },
  backHome: "Back to the home page",
  backToHistory: "Back to the history",
  notFoundTitle: "We cannot open this game",
  notFoundBody: "The game does not exist, was deleted after the retention period, or you have no access to it.",
};

export default review;
