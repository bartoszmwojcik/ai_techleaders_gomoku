import { beforeEach, describe, expect, it, vi } from "vitest";

import { BOARD_CELLS } from "../games/board";
import { BOARD_SIZE } from "../games/rules";
import type { ChooseMoveInput, MoveChoice } from "./choose-move";

const { chooseMove } = vi.hoisted(() => ({ chooseMove: vi.fn<(input: ChooseMoveInput) => MoveChoice>() }));
vi.mock("./choose-move", () => ({ chooseMove }));

const { ARENA_BUDGET, playArenaGame } = await import("./arena");

const move = (cell: number): MoveChoice => ({ cell, depth: 0, nodes: 0, score: 0, reason: "heuristic", stoppedBy: "completed" });

beforeEach(() => {
  chooseMove.mockReset();
});

describe("playArenaGame with a scripted engine", () => {
  it("rejects an engine that returns an occupied cell", () => {
    chooseMove.mockReturnValueOnce(move(0)).mockReturnValueOnce(move(0));
    expect(() => playArenaGame(1, 1, 2, ARENA_BUDGET)).toThrow("Engine returned the occupied cell 0");
  });

  it("ends a full board without five in a row as a draw, asking each level for its colour", () => {
    // ((x >> 1) + y) % 2 has no three in a row anywhere: 113 black cells, 112 white.
    const black: number[] = [];
    const white: number[] = [];
    for (let cell = 0; cell < BOARD_CELLS; cell++) {
      const x = cell % BOARD_SIZE;
      const y = Math.floor(cell / BOARD_SIZE);
      (((x >> 1) + y) % 2 === 0 ? black : white).push(cell);
    }
    chooseMove.mockImplementation(({ position }) => move((position.moveCount % 2 === 0 ? black : white)[position.moveCount >> 1]!));

    const game = playArenaGame(5, 2, 1, ARENA_BUDGET);

    expect(game).toMatchObject({ seed: 5, winner: null });
    expect(game.moves).toHaveLength(BOARD_CELLS);
    expect(chooseMove.mock.calls[0]![0]).toMatchObject({ level: 2, budget: ARENA_BUDGET });
    expect(chooseMove.mock.calls[1]![0]).toMatchObject({ level: 1 });
    expect(chooseMove.mock.calls[0]![0].now()).toBe(0);
  });
});
