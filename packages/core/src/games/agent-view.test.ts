import { describe, expect, it } from "vitest";

import { agentGameView, type AgentViewInput } from "./agent-view";
import { cellOf } from "./board";
import { MCP_RETRY_HINT_MS } from "./constants";

const input = (over: Partial<AgentViewInput> = {}): AgentViewInput => ({
  status: "active",
  blackSeat: 2,
  turnSeat: 2,
  moveCount: 0,
  moves: [],
  result: null,
  clock: { remainingMs: [600_000, 590_000], running: 2, now: 1234 },
  you: { seat: 2 },
  opponentKind: "account",
  ...over,
});

describe("agentGameView", () => {
  it("shows an empty board on the agent's turn, with the clocks from its side", () => {
    const view = agentGameView(input());

    expect(view).toEqual({
      status: "active",
      you: { seat: 2, color: "black" },
      opponent: { kind: "account" },
      turn: "you",
      nextMoveNumber: 1,
      board: Array(15).fill(".".repeat(15)),
      moves: [],
      clock: { youMs: 590_000, opponentMs: 600_000, runningSide: "you", serverNow: 1234 },
      result: null,
      retryAfterMs: 0,
    });
  });

  it("draws the stones by row and column and lists the moves with their colours", () => {
    const moves = [cellOf(7, 7), cellOf(0, 14), cellOf(14, 0)];
    const view = agentGameView(input({ moveCount: 3, moves, turnSeat: 1 }));

    expect(view.board[7]![7]).toBe("B");
    expect(view.board[14]![0]).toBe("W");
    expect(view.board[0]![14]).toBe("B");
    expect(view.board.join("").replaceAll(".", "")).toHaveLength(3);
    expect(view.moves).toEqual([
      { n: 1, x: 7, y: 7, color: "black" },
      { n: 2, x: 0, y: 14, color: "white" },
      { n: 3, x: 14, y: 0, color: "black" },
    ]);
    expect(view.nextMoveNumber).toBe(4);
    expect(view.turn).toBe("opponent");
    expect(view.retryAfterMs).toBe(MCP_RETRY_HINT_MS);
  });

  it("lists only the moves after the ones the agent knows, but keeps them all on the board", () => {
    const moves = [cellOf(1, 1), cellOf(2, 2), cellOf(3, 3)];
    const view = agentGameView(input({ moveCount: 3, moves }), 2);

    expect(view.moves).toEqual([{ n: 3, x: 3, y: 3, color: "black" }]);
    expect(view.board[1]![1]).toBe("B");
    expect(view.board[2]![2]).toBe("W");
  });

  it("gives the white agent the white colour and the opponent's clock as its own opposite", () => {
    const view = agentGameView(
      input({ blackSeat: 1, turnSeat: 1, clock: { remainingMs: [1, 2], running: 1, now: 5 }, you: { seat: 2 } }),
    );

    expect(view.you.color).toBe("white");
    expect(view.turn).toBe("opponent");
    expect(view.clock).toEqual({ youMs: 2, opponentMs: 1, runningSide: "opponent", serverNow: 5 });
  });

  it("reads the clocks the other way round for the agent on seat 1", () => {
    const view = agentGameView(
      input({ blackSeat: 1, turnSeat: 1, clock: { remainingMs: [1, 2], running: 1, now: 5 }, you: { seat: 1 } }),
    );

    expect(view.you.color).toBe("black");
    expect(view.turn).toBe("you");
    expect(view.clock).toEqual({ youMs: 1, opponentMs: 2, runningSide: "you", serverNow: 5 });
  });

  it("has no colour and no running clock before the colours are drawn", () => {
    const view = agentGameView(
      input({ status: "waiting", blackSeat: null, turnSeat: null, clock: { remainingMs: [1, 2], running: null, now: 5 } }),
    );

    expect(view.you.color).toBeNull();
    expect(view.turn).toBeNull();
    expect(view.clock.runningSide).toBeNull();
    expect(view.retryAfterMs).toBe(MCP_RETRY_HINT_MS);
  });

  it.each([
    [2, "win"],
    [1, "loss"],
  ] as const)("reads the winner %s as %s for the agent in seat 2", (winnerSeat, outcome) => {
    const line = [0, 1, 2, 3, 4];
    const view = agentGameView(
      input({
        status: "finished",
        turnSeat: null,
        moveCount: 9,
        result: { winnerSeat, reason: "five_in_row", winLine: line },
      }),
    );

    expect(view.result).toEqual({
      outcome,
      reason: "five_in_row",
      winLine: [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })),
    });
    expect(view.turn).toBeNull();
    expect(view.retryAfterMs).toBeNull();
  });

  it("reports a draw and a loss on time without a winning line", () => {
    const draw = agentGameView(
      input({ status: "finished", turnSeat: null, result: { winnerSeat: null, reason: "draw", winLine: null } }),
    );
    const timeout = agentGameView(
      input({ status: "finished", turnSeat: null, result: { winnerSeat: 1, reason: "timeout", winLine: null } }),
    );

    expect(draw.result).toEqual({ outcome: "draw", reason: "draw" });
    expect(timeout.result).toEqual({ outcome: "loss", reason: "timeout" });
  });

  it("stops suggesting a retry for a cancelled game", () => {
    const view = agentGameView(input({ status: "cancelled", turnSeat: null }));

    expect(view.status).toBe("cancelled");
    expect(view.retryAfterMs).toBeNull();
  });

  it("contains no names, ids or text of the opponent", () => {
    const text = JSON.stringify(agentGameView(input()));

    expect(Object.keys(agentGameView(input())).sort()).toEqual(
      ["board", "clock", "moves", "nextMoveNumber", "opponent", "result", "retryAfterMs", "status", "turn", "you"],
    );
    expect(text).not.toMatch(/name|email|user/i);
  });
});
