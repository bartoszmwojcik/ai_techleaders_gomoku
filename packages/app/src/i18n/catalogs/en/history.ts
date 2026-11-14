import type { Translation } from "../types";

const history: Translation<"history"> = {
  meta: { title: "Game history — Gomoku" },
  heading: "Game history",
  listTitle: "Finished games",
  loading: "Loading the game history",
  emptyTitle: "You have not played any game yet",
  emptyBody: "Play a friend or pick an opponent in the lobby, and your finished games will show up here.",
  review: "Review the game",
  added: { one: "Added {count} older game.", other: "Added {count} older games." },
  sessionExpired: "Session expired",
  loginAgain: "Log in again",
  signedOut: "{link} to see older games.",
  more: "Show older",
  retry: "Try again",
  moreFailedTitle: "Could not load older games",
  moreFailedBody: "Check your internet connection and try again.",
  backHome: "Back to the home page",
  result: { win: "Win", loss: "Loss", draw: "Draw" },
  reason: { five_in_row: "5 in a row", timeout: "Out of time", resignation: "Resignation", draw: "Board full", points: "Points" },
  paperDetail: "{variant} · {score}",
  paperDetailWithReason: "{variant} · {score} · {reason}",
};

export default history;
