import { coordsOf } from "@gomoku/core/games/board";
import { turnColor } from "@gomoku/core/games/rules";
import type { GameVariant } from "@gomoku/core/games/paper/constants";
import type { GameColor, Seat } from "@gomoku/core/games/types";

import plGame from "@/i18n/catalogs/pl/game";
import { textsOf, type TranslatorOf } from "@/i18n/client";
import type { GameView } from "@/server/http/game-view";

/** A stone for the board component: moves alternate, black first (#22 Q1). */
export type PlacedStone = { cell: number; color: GameColor };

export function stonesOf(moves: readonly number[]): PlacedStone[] {
  return moves.map((cell, index) => ({ cell, color: turnColor(index) }));
}

/** How many moves of the sheet the client holds: the paper game keeps them in `paper.moves`, the classic one in `moves`. */
export function knownMoves(game: Pick<GameView, "moves" | "paper">): number {
  return game.paper ? game.paper.moves.length : game.moves.length;
}

/**
 * Puts a state read with `?after=<after>` on top of the one the client holds. The server sends
 * only the moves after the first `after`, so the known ones are kept and the new ones appended
 * (the classic `moves`, or `paper.moves` of the paper game).
 * A stale response (older than what the client holds) never moves the board back, and a finished
 * game never reopens: a game can end without a move (timeout, resignation), so a late `active`
 * response with the same move count must not undo `finished`.
 */
export function mergeState<T extends Pick<GameView, "moves" | "moveCount" | "status" | "paper">>(current: T, next: T, after: number): T {
  if (next.moveCount < knownMoves(current)) return current;
  if (current.status === "finished" && next.status !== "finished") return current;
  const merged = { ...next, moves: [...current.moves.slice(0, after), ...next.moves] };
  if (next.paper) {
    merged.paper = { ...next.paper, moves: [...(current.paper?.moves ?? []).slice(0, after), ...next.paper.moves] };
  }
  return merged;
}

/** A stone of the paper game for `PaperBoard`. */
export type PaperPlaced = { x: number; y: number; seat: Seat; auto: boolean };

export function paperStonesOf(paper: NonNullable<GameView["paper"]>): PaperPlaced[] {
  return paper.moves.map(({ x, y, seat, auto }) => ({ x, y, seat, auto }));
}

/** The colour a seat plays, or `null` before the draw (a waiting game). */
export function colorOfSeat(blackSeat: Seat | null, seat: Seat): GameColor | null {
  if (blackSeat === null) return null;
  return blackSeat === seat ? "black" : "white";
}

/** How the two sides are named on screen: by colour in the classic game, by mark (black = ×, white = ○) in the paper one. */
export type SideWords = {
  /** "Twój ruch (czarne)". */
  name: Record<GameColor, string>;
  /** "Grasz czarnymi". */
  plays: Record<GameColor, string>;
  /** "Czarne: Ala". */
  title: Record<GameColor, string>;
  /** "Ruch czarnych: Ala". */
  genitive: Record<GameColor, string>;
  /** "Wygrały czarne: Ala". */
  wins: Record<GameColor, string>;
  /** The button of the two-step move. */
  place: Record<GameColor, string>;
  rematchSwapped: string;
  rematchOffer: string;
  rematchInfo: string;
};

export type GameTranslator = TranslatorOf<"game">;

/** Polish, from the bundle: the default of every helper below, so callers not yet migrated keep their texts. */
export const PL_GAME: GameTranslator = textsOf<"game">(plGame);

const COLORS = ["black", "white"] as const;

const wordsCache = new WeakMap<GameTranslator, Record<"classic" | "paper", SideWords>>();

/** Anything but the paper variant reads as classic, so a page that meets a variant it does not know can still say it does not know it. */
export function sideWords(variant: GameVariant | undefined, t: GameTranslator = PL_GAME): SideWords {
  let words = wordsCache.get(t);
  if (!words) {
    words = { classic: wordsOf("classic", t), paper: wordsOf("paper", t) };
    wordsCache.set(t, words);
  }
  return variant === "paper" ? words.paper : words.classic;
}

function wordsOf(kind: "classic" | "paper", t: GameTranslator): SideWords {
  const both = (group: "name" | "plays" | "title" | "genitive" | "wins" | "place") =>
    Object.fromEntries(COLORS.map((color) => [color, t(`sides.${kind}.${group}.${color}`)])) as Record<GameColor, string>;
  return {
    name: both("name"),
    plays: both("plays"),
    title: both("title"),
    genitive: both("genitive"),
    wins: both("wins"),
    place: both("place"),
    rematchSwapped: t(`sides.${kind}.rematchSwapped`),
    rematchOffer: t(`sides.${kind}.rematchOffer`),
    rematchInfo: t(`sides.${kind}.rematchInfo`),
  };
}

type CellState = "empty" | "black" | "white";

/** "Kolumna C, rząd 7, puste": the board's screen reader labels in the reader's language. */
export function cellLabelOf(t: GameTranslator) {
  return ({ column, row, state }: { column: string; row: number; state: CellState }) =>
    t("board.cell", { column, row, state: t(`board.state.${state}`) });
}

export const cellLabel = cellLabelOf(PL_GAME);

const columnOf = (cell: number) => String.fromCharCode(65 + coordsOf(cell).x);
const rowOf = (cell: number) => coordsOf(cell).y + 1;

/** "Kolumna C, rząd 7" for a cell index. */
export function cellName(cell: number, t: GameTranslator = PL_GAME): string {
  return t("board.cellName", { column: columnOf(cell), row: rowOf(cell) });
}

/** "Przeciwnik: kolumna C, rząd 7", read out when the opponent's stone appears. */
export function opponentMoveText(cell: number, t: GameTranslator = PL_GAME): string {
  return t("board.opponentMove", { column: columnOf(cell), row: rowOf(cell) });
}

export { agentNameOf, playerName, playerNameOf, type PlayerName } from "./player-name";

export type Outcome = { result: "win" | "loss" | "draw"; title: string; detail: string };

/** "7 : 5" with the viewer's points first. */
const scoreText = (scores: [number, number], seat: Seat) => `${scores[seat - 1]} : ${scores[2 - seat]}`;

function pointsOutcome(winnerSeat: Seat | null, seat: Seat, scores: [number, number] | undefined, t: GameTranslator): Outcome {
  const score = scores ? scoreText(scores, seat) : "";
  const detail = scores ? t("outcome.pointsDetail") : "";
  if (winnerSeat === null) return { result: "draw", title: scores ? t("outcome.drawScore", { score }) : t("outcome.draw"), detail };
  return winnerSeat === seat
    ? { result: "win", title: scores ? t("outcome.winScore", { score }) : t("outcome.pointsWon"), detail }
    : { result: "loss", title: scores ? t("outcome.lossScore", { score }) : t("outcome.pointsLost"), detail };
}

/** The banner of a finished game from the point of view of the viewer (p06.1, p06.2, p06.4; texts of the prototype). */
export function outcomeOf(game: { result: GameView["result"]; you: { seat: Seat } }, t: GameTranslator = PL_GAME): Outcome | null {
  const { result } = game;
  if (!result) return null;
  if (result.reason === "draw") return { result: "draw", title: t("outcome.draw"), detail: t("outcome.drawFull") };
  const won = result.winnerSeat === game.you.seat;
  switch (result.reason) {
    case "five_in_row":
      return won
        ? { result: "win", title: t("outcome.won"), detail: t("outcome.fiveWon") }
        : { result: "loss", title: t("outcome.lost"), detail: t("outcome.fiveLost") };
    case "timeout":
      return won
        ? { result: "win", title: t("outcome.timeoutWon"), detail: "" }
        : { result: "loss", title: t("outcome.timeoutLost"), detail: "" };
    case "resignation":
      if (result.scores) {
        // The paper game: the points are shown, the resignation decided anyway (R5).
        const detail = t("outcome.resignedScore", { score: scoreText(result.scores, game.you.seat) });
        return won
          ? { result: "win", title: t("outcome.resignWonScore"), detail }
          : { result: "loss", title: t("outcome.resignLostScore"), detail };
      }
      return won
        ? { result: "win", title: t("outcome.resignWon"), detail: "" }
        : { result: "loss", title: t("outcome.resignLost"), detail: "" };
    case "points":
      return pointsOutcome(result.winnerSeat, game.you.seat, result.scores, t);
  }
}

/** The bot's seat in a game with the bot (hosted-bot spec), or `undefined`. */
export function botOf(game: Pick<GameView, "players">): GameView["players"][number] | undefined {
  return game.players.find((player) => player.kind === "bot");
}

/** The bot is to move: the page says "Bot myśli…" and reads the state every 750 ms (R15). */
export function botThinking(game: Pick<GameView, "status" | "turnSeat" | "players">): boolean {
  return game.status === "active" && game.turnSeat !== null && botOf(game)?.seat === game.turnSeat;
}
