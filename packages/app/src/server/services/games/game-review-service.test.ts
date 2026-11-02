import { cellOf } from "@gomoku/core";
import { Game, GamePlayer, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { canReview, GameReviewService } from "./game-review-service";

const ID = "0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978";
const ME = "user-1";

const bits = (cells: number[]) => Array.from({ length: 225 }, (_, cell) => (cells.includes(cell) ? "1" : "0")).join("");
// Black (seat 1) wins with row 7, x 0..4; white's four stones are on row 8.
const BLACK = [0, 1, 2, 3, 4].map((x) => cellOf(x, 7));
const WHITE = [0, 1, 2, 3].map((x) => cellOf(x, 8));
const MOVES = BLACK.flatMap((cell, index) => (WHITE[index] === undefined ? [cell] : [cell, WHITE[index]!]));

const game = (over: Record<string, unknown> = {}) => ({
  id: ID,
  status: "finished",
  blackSeat: 1,
  moveCount: MOVES.length,
  stonesBlack: bits(BLACK),
  stonesWhite: bits(WHITE),
  moves: Uint8Array.from(MOVES),
  winnerSeat: 1,
  endReason: "five_in_row",
  finishedAt: new Date("2026-11-02T10:00:00.000Z"),
  ...over,
});

const mine = { seat: 1, kind: "account", user: { id: ME, displayName: "Ala" }, displayName: "Ala" };
const theirs = { seat: 2, kind: "guest", user: null, nickname: "Bob" };

function setup(found: unknown, players: unknown[] = [mine, theirs]) {
  const findOne = vi.fn(async () => found);
  const find = vi.fn(async () => players);
  const service = new GameReviewService({ em: { findOne, find } as unknown as EntityManager });
  return { service, findOne, find };
}

describe("GameReviewService.open", () => {
  it("returns the whole game for its participant with an account", async () => {
    const { service, findOne, find } = setup(game());

    const review = await service.open({ kind: "account", userId: ME }, ID);

    expect(findOne).toHaveBeenCalledExactlyOnceWith(Game, { id: ID, status: "finished" });
    expect(find).toHaveBeenCalledExactlyOnceWith(GamePlayer, { game: ID }, { populate: ["user"], orderBy: { seat: "asc" } });
    expect(review).toEqual({
      gameId: ID,
      finishedAt: "2026-11-02T10:00:00.000Z",
      blackSeat: 1,
      moves: MOVES,
      result: { winnerSeat: 1, reason: "five_in_row", winLine: [...BLACK].sort((a, b) => a - b) },
      players: [
        { seat: 1, kind: "account", displayName: "Ala" },
        { seat: 2, kind: "guest", displayName: "Bob" },
      ],
      viewerSeat: 1,
    });
  });

  it("names an agent by what it declared and never exposes an account id or e-mail", async () => {
    const agent = { seat: 2, kind: "agent", user: null, agentName: "Claude" };
    const { service } = setup(game(), [mine, agent]);

    const review = await service.open({ kind: "account", userId: ME }, ID);

    expect(review?.players[1]).toEqual({ seat: 2, kind: "agent", displayName: null, agentName: "Claude" });
    expect(JSON.stringify(review)).not.toMatch(/user-1|email/);
  });

  it("reads a draw and an agent that declared no model name", async () => {
    const agent = { seat: 2, kind: "agent", user: null, agentName: null };
    const { service } = setup(game({ winnerSeat: null, endReason: "draw" }), [mine, agent]);

    const review = await service.open({ kind: "account", userId: ME }, ID);

    expect(review?.result).toEqual({ winnerSeat: null, reason: "draw", winLine: null });
    expect(review?.players[1]).toEqual({ seat: 2, kind: "agent", displayName: null, agentName: null });
  });

  it("answers null for a malformed id without reading anything", async () => {
    const { service, findOne } = setup(game());

    expect(await service.open({ kind: "account", userId: ME }, "not-a-uuid")).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it("answers null for a game that is not there, not finished or removed (no players left)", async () => {
    expect(await setup(null).service.open({ kind: "account", userId: ME }, ID)).toBeNull();
    expect(await setup(game(), []).service.open({ kind: "account", userId: ME }, ID)).toBeNull();
  });

  it("answers null for somebody else's game, the same as for a missing one", async () => {
    const { service, find } = setup(game());

    expect(await service.open({ kind: "account", userId: "stranger" }, ID)).toBeNull();
    expect(find).toHaveBeenCalledOnce();
  });
});

describe("canReview", () => {
  it("lets in only an account that has a seat in the game", () => {
    expect(canReview({ kind: "account", userId: ME }, [mine, theirs])).toBe(true);
    expect(canReview({ kind: "account", userId: "other" }, [mine, theirs])).toBe(false);
    // A guest or an agent has no account, whatever the id.
    expect(canReview({ kind: "account", userId: ME }, [{ kind: "guest", user: { id: ME } }])).toBe(false);
    expect(canReview({ kind: "account", userId: ME }, [{ kind: "account", user: null }])).toBe(false);
  });
});
