import { BOARD_SIZE, turnColor } from "./rules";
import { MCP_RETRY_HINT_MS } from "./constants";
import { coordsOf } from "./board";
import type { ClockView } from "./clock";
import { PAPER_BOARD_SIZE, PAPER_MAX_GAP } from "./paper/constants";
import type { PaperView } from "./paper/view";
import type { EndReason, GameColor, GameStatus, ParticipantKind, Seat } from "./types";

/** What the view of the agent needs from the state of a game (all moves, not only the new ones). */
export type AgentViewInput = {
  status: GameStatus;
  blackSeat: Seat | null;
  turnSeat: Seat | null;
  moveCount: number;
  /** Cells of every move, in order. */
  moves: readonly number[];
  result: { winnerSeat: Seat | null; reason: EndReason; winLine: readonly number[] | null } | null;
  clock: ClockView;
  you: { seat: Seat };
  /** The other participant's kind: a kind only, never a name (BR-31). */
  opponentKind: ParticipantKind;
  /** `"paper"` (E11) with `paper`: then `moves` is empty and the sheet is read from `paper`. */
  variant?: "classic" | "paper";
  paper?: Pick<PaperView, "moves" | "scores" | "autoSeat" | "autoMoveAt">;
};

type Point = { x: number; y: number };

/** The game as `get_state` and `play_move` show it to an agent (E06-S02): numbers and enums only. */
export type AgentGameState = {
  status: GameStatus;
  you: { seat: Seat; color: GameColor | null };
  opponent: { kind: ParticipantKind };
  turn: "you" | "opponent" | null;
  /** The value for `moveNumber` of `play_move`. */
  nextMoveNumber: number;
  /**
   * One string per row `y = 0..14`; `x` is the column; `.` empty, `B` black, `W` white. In the paper
   * variant (E11) a cut-out of the 101×101 sheet instead: the rectangle of the stones with a margin
   * of three fields, whose top-left corner is `boardOrigin` (the absolute `x`, `y` of the cell).
   */
  board: string[];
  moves: (Point & { n: number; color: GameColor; auto?: boolean })[];
  /** Only the paper variant: the points of each side, the seat whose stones the automat puts, and when. */
  variant?: "paper";
  boardOrigin?: Point;
  scores?: { you: number; opponent: number };
  autoSeat?: Seat | null;
  autoMoveAt?: string | null;
  clock: {
    youMs: number;
    opponentMs: number;
    runningSide: "you" | "opponent" | null;
    serverNow: number;
  };
  result: {
    outcome: "win" | "loss" | "draw";
    reason: EndReason;
    winLine?: Point[];
  } | null;
  /** Suggested pause before the next read; `null` once the game is over. */
  retryAfterMs: number | null;
};

const other = (seat: Seat): Seat => (seat === 1 ? 2 : 1);

/**
 * The view of a game for the agent in `you.seat`. `afterMove` is the number of moves the agent
 * already knows: `moves` lists the rest, the board always shows all of them. Pure: the opponent
 * is described by its kind only, so no text of a human reaches the model.
 */
export function agentGameView(input: AgentViewInput, afterMove = 0): AgentGameState {
  if (input.variant === "paper" && input.paper) return paperAgentView(input, input.paper, afterMove);
  const { you, blackSeat, turnSeat, clock } = input;
  const grid = Array.from({ length: BOARD_SIZE }, () => Array<string>(BOARD_SIZE).fill("."));
  const moves = input.moves.map((cell, index) => ({
    n: index + 1,
    ...coordsOf(cell),
    color: turnColor(index),
  }));
  for (const { x, y, color } of moves) grid[y]![x] = color === "black" ? "B" : "W";

  const turn = input.status === "active" ? sideOf(you.seat, turnSeat) : null;
  const ended = input.status === "finished" || input.status === "cancelled";
  return {
    status: input.status,
    you: { seat: you.seat, color: blackSeat === null ? null : blackSeat === you.seat ? "black" : "white" },
    opponent: { kind: input.opponentKind },
    turn,
    nextMoveNumber: input.moveCount + 1,
    board: grid.map((row) => row.join("")),
    moves: moves.slice(afterMove),
    clock: clockOf(input),
    result: resultOf(input),
    retryAfterMs: ended ? null : turn === "you" ? 0 : MCP_RETRY_HINT_MS,
  };
}

function sideOf(you: Seat, seat: Seat | null): "you" | "opponent" | null {
  return seat === null ? null : seat === you ? "you" : "opponent";
}

function clockOf({ clock, you }: AgentViewInput): AgentGameState["clock"] {
  return {
    youMs: clock.remainingMs[you.seat - 1]!,
    opponentMs: clock.remainingMs[other(you.seat) - 1]!,
    runningSide: sideOf(you.seat, clock.running),
    serverNow: clock.now,
  };
}

function resultOf({ result, you }: AgentViewInput): AgentGameState["result"] {
  if (!result) return null;
  return {
    outcome: result.winnerSeat === null ? "draw" : result.winnerSeat === you.seat ? "win" : "loss",
    reason: result.reason,
    ...(result.winLine && { winLine: result.winLine.map(coordsOf) }),
  };
}

/**
 * The paper game (E11): the sheet is 101×101, so the board is the rectangle holding every stone
 * plus a margin of `PAPER_MAX_GAP` (every legal move is inside it), cut at the edges of the sheet.
 * No stone yet: the margin around the middle, where the first stone must go. While the automat
 * plays for the agent, the turn is the opponent's: the agent has nothing to do but wait.
 */
function paperAgentView(
  input: AgentViewInput,
  paper: NonNullable<AgentViewInput["paper"]>,
  afterMove: number,
): AgentGameState {
  const { you, blackSeat, turnSeat, clock } = input;
  const colorOf = (seat: Seat): GameColor => (seat === blackSeat ? "black" : "white");
  const moves = paper.moves.map(({ n, x, y, seat, auto }) => ({ n, x, y, color: colorOf(seat), auto }));
  const xs = moves.length ? moves.map((move) => move.x) : [(PAPER_BOARD_SIZE - 1) / 2];
  const ys = moves.length ? moves.map((move) => move.y) : [(PAPER_BOARD_SIZE - 1) / 2];
  const fromX = Math.max(0, Math.min(...xs) - PAPER_MAX_GAP);
  const fromY = Math.max(0, Math.min(...ys) - PAPER_MAX_GAP);
  const toX = Math.min(PAPER_BOARD_SIZE - 1, Math.max(...xs) + PAPER_MAX_GAP);
  const toY = Math.min(PAPER_BOARD_SIZE - 1, Math.max(...ys) + PAPER_MAX_GAP);
  const grid = Array.from({ length: toY - fromY + 1 }, () => Array<string>(toX - fromX + 1).fill("."));
  for (const { x, y, color } of moves) grid[y - fromY]![x - fromX] = color === "black" ? "B" : "W";

  const active = input.status === "active";
  const mine = turnSeat === you.seat && paper.autoSeat !== you.seat;
  const turn = active && turnSeat !== null ? (mine ? "you" : "opponent") : null;
  const ended = input.status === "finished" || input.status === "cancelled";
  const untilAuto = paper.autoMoveAt === null ? null : Date.parse(paper.autoMoveAt) - clock.now;
  return {
    status: input.status,
    variant: "paper",
    you: { seat: you.seat, color: blackSeat === null ? null : colorOf(you.seat) },
    opponent: { kind: input.opponentKind },
    turn,
    nextMoveNumber: input.moveCount + 1,
    board: grid.map((row) => row.join("")),
    boardOrigin: { x: fromX, y: fromY },
    moves: moves.filter((move) => move.n > afterMove),
    scores: { you: paper.scores[you.seat - 1]!, opponent: paper.scores[other(you.seat) - 1]! },
    autoSeat: paper.autoSeat,
    autoMoveAt: paper.autoMoveAt,
    clock: clockOf(input),
    result: resultOf(input),
    retryAfterMs: ended
      ? null
      : turn === "you"
        ? 0
        : untilAuto === null
          ? MCP_RETRY_HINT_MS
          : Math.min(MCP_RETRY_HINT_MS, Math.max(0, untilAuto)),
  };
}
