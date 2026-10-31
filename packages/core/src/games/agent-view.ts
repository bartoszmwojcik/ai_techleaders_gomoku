import { BOARD_SIZE, turnColor } from "./rules";
import { MCP_RETRY_HINT_MS } from "./constants";
import { coordsOf } from "./board";
import type { ClockView } from "./clock";
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
  /** One string per row `y = 0..14`; `x` is the column; `.` empty, `B` black, `W` white. */
  board: string[];
  moves: (Point & { n: number; color: GameColor })[];
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
  const { you, blackSeat, turnSeat, clock } = input;
  const grid = Array.from({ length: BOARD_SIZE }, () => Array<string>(BOARD_SIZE).fill("."));
  const moves = input.moves.map((cell, index) => ({
    n: index + 1,
    ...coordsOf(cell),
    color: turnColor(index),
  }));
  for (const { x, y, color } of moves) grid[y]![x] = color === "black" ? "B" : "W";

  const sideOf = (seat: Seat | null) => (seat === null ? null : seat === you.seat ? "you" : "opponent");
  const turn = input.status === "active" ? sideOf(turnSeat) : null;
  const ended = input.status === "finished" || input.status === "cancelled";
  const result = input.result;
  return {
    status: input.status,
    you: { seat: you.seat, color: blackSeat === null ? null : blackSeat === you.seat ? "black" : "white" },
    opponent: { kind: input.opponentKind },
    turn,
    nextMoveNumber: input.moveCount + 1,
    board: grid.map((row) => row.join("")),
    moves: moves.slice(afterMove),
    clock: {
      youMs: clock.remainingMs[you.seat - 1]!,
      opponentMs: clock.remainingMs[other(you.seat) - 1]!,
      runningSide: sideOf(clock.running),
      serverNow: clock.now,
    },
    result: result
      ? {
          outcome:
            result.winnerSeat === null ? "draw" : result.winnerSeat === you.seat ? "win" : "loss",
          reason: result.reason,
          ...(result.winLine && { winLine: result.winLine.map(coordsOf) }),
        }
      : null,
    retryAfterMs: ended ? null : turn === "you" ? 0 : MCP_RETRY_HINT_MS,
  };
}
