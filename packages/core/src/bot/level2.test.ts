import { describe, expect, it } from "vitest";

import { BOARD_CELLS, cellOf, coordsOf, createBitboard, hasStone, withStone, type Bitboard } from "../games/board";
import { chooseMove, type BotPosition, type ChooseMoveInput, type MoveChoice, type SearchBudget } from "./choose-move";
import { CHECK_INTERVAL, MATE_BOUND, WIN_SCORE, fromTableScore, searchLevel2, toTableScore } from "./level2";
import { EngineBoard, type Side } from "./patterns";
import { createRng } from "./seed";

const BUDGET: SearchBudget = { softMs: 1e9, ceilingMs: 1e9, maxDepth: 4, ttBytes: 1 << 16, maxNodes: 20_000 };

type Stones = [number, number][];

function position(black: Stones, white: Stones, moveCount = black.length + white.length): BotPosition {
  const bits = (stones: Stones) => stones.reduce<Bitboard>((board, [x, y]) => withStone(board, cellOf(x, y)), createBitboard());
  return { black: bits(black), white: bits(white), moveCount };
}

function search(pos: BotPosition, overrides: Partial<ChooseMoveInput> = {}, budget: Partial<SearchBudget> = {}): MoveChoice {
  return chooseMove({ position: pos, level: 2, budget: { ...BUDGET, ...budget }, rng: createRng(7), now: () => 0, ...overrides });
}

/** A middle-game position: 20 moves of level 1 against itself. */
function middleGame(seed: number): BotPosition {
  const rng = createRng(seed);
  let black = createBitboard();
  let white = createBitboard();
  for (let moveCount = 0; moveCount < 20; moveCount++) {
    const { cell } = chooseMove({ position: { black, white, moveCount }, level: 1, budget: BUDGET, rng, now: () => 0 });
    if (moveCount % 2 === 0) black = withStone(black, cell);
    else white = withStone(white, cell);
  }
  return { black, white, moveCount: 20 };
}

const row = (y: number, from: number, to: number): Stones => Array.from({ length: to - from + 1 }, (_, index) => [from + index, y]);
const isFree = (pos: BotPosition, cell: number) => !hasStone(pos.black, cell) && !hasStone(pos.white, cell);

describe("level 2 tactics", () => {
  it("wins in one without searching", () => {
    expect(search(position([...row(7, 3, 6), [0, 14]], row(3, 3, 6)))).toMatchObject({
      reason: "win",
      score: WIN_SCORE - 1,
      depth: 0,
      nodes: 0,
    });
  });

  it("blocks a single four without searching", () => {
    const choice = search(position([[2, 3], [10, 10], [12, 12], [0, 14]], row(3, 3, 6)));
    expect(choice).toMatchObject({ cell: cellOf(7, 3), reason: "block", score: 0, nodes: 0 });
  });

  it("blocks one end of an open four and knows the game is lost", () => {
    const choice = search(position([[10, 10], [12, 12], [0, 14], [14, 14]], row(3, 3, 6)));
    expect(choice.reason).toBe("block");
    expect([cellOf(2, 3), cellOf(7, 3)]).toContain(choice.cell);
    expect(choice.score).toBe(-(WIN_SCORE - 2));
  });

  it("wins in three: turns an open three into an open four", () => {
    const choice = search(position(row(7, 5, 7), [[0, 0], [14, 0], [0, 14]]));
    expect(choice.reason).toBe("search");
    expect([cellOf(4, 7), cellOf(8, 7)]).toContain(choice.cell);
    expect(choice.score).toBeGreaterThanOrEqual(MATE_BOUND);
    expect(choice.stoppedBy).toBe("completed");
    expect(choice.depth).toBeLessThan(BUDGET.maxDepth);
  });

  it("prevents the opponent's double four", () => {
    // White threatens (7, 7): four on row 7 (blocked at x = 3) and four on column 7 (blocked at y = 3).
    const black: Stones = [[3, 7], [7, 3], [14, 14], [14, 11], [11, 14], [0, 14]];
    const white: Stones = [...row(7, 4, 6), [7, 4], [7, 5], [7, 6]];
    const choice = search(position(black, white));
    expect(choice.reason).toBe("search");
    const board = new EngineBoard();
    for (const [x, y] of black) board.place(cellOf(x, y), 0);
    for (const [x, y] of white) board.place(cellOf(x, y), 1);
    board.place(choice.cell, 0);
    const threats = new Int16Array(BOARD_CELLS);
    for (let cell = 0; cell < BOARD_CELLS; cell++) {
      if (board.cells[cell] !== 0) continue;
      board.place(cell, 1);
      expect(board.winningCells(1, threats, 2), `white double four at ${JSON.stringify(coordsOf(cell))}`).toBeLessThan(2);
      board.remove(cell);
    }
  });

  it("searches to the end of a nearly full board (a full board scores a draw)", () => {
    // ((x >> 1) + y) % 2 has no three in a row anywhere: no window can ever hold a four.
    const black: Stones = [];
    const white: Stones = [];
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) (((x >> 1) + y) % 2 === 0 ? black : white).push([x, y]);
    }
    const free = [black.pop()!, white.pop()!].map(([x, y]) => cellOf(x, y));
    const choice = search(position(black, white), {}, { maxDepth: 2 });
    expect(free).toContain(choice.cell);
    expect(choice).toMatchObject({ reason: "search", score: 0, depth: 2, stoppedBy: "completed" });
  });
});

describe("level 2 determinism (R16)", () => {
  it("gives the same move and iterations for the same rng and node limit", () => {
    const pos = middleGame(1);
    const run = () => {
      const iterations: MoveChoice[] = [];
      const choice = search(pos, { rng: createRng(5), onIteration: (partial) => iterations.push(partial) }, { maxNodes: 3000, maxDepth: 10 });
      return { choice, iterations };
    };
    const first = run();
    expect(run()).toEqual(first);
    expect(first.iterations.length).toBeGreaterThan(1);
    expect(first.iterations.map((iteration) => iteration.depth)).toEqual(first.iterations.map((_, index) => index + 1));
    expect(first.choice).toMatchObject({ reason: "search", stoppedBy: "nodes" });
    expect(first.choice.depth).toBe(first.iterations.at(-1)!.depth);
    expect(first.choice.nodes).toBe(3000);
  });

  it.each([0, 16, 100, 1 << 20])("plays a legal, repeatable move with a transposition table of %i bytes", (ttBytes) => {
    const pos = middleGame(4);
    const first = search(pos, {}, { ttBytes, maxNodes: 4000, maxDepth: 6 });
    expect(isFree(pos, first.cell)).toBe(true);
    expect(search(pos, {}, { ttBytes, maxNodes: 4000, maxDepth: 6 })).toEqual(first);
  });
});

describe("level 2 limits", () => {
  const pos = middleGame(5);

  it("completes when it reaches maxDepth", () => {
    expect(search(pos, {}, { maxDepth: 2 })).toMatchObject({ reason: "search", depth: 2, stoppedBy: "completed" });
  });

  it.each([
    ["no node at all", { maxNodes: 0 }, {}, "nodes"],
    ["a zero ceiling", { ceilingMs: 0 }, {}, "ceiling"],
    ["the stop flag", {}, { shouldStop: () => true }, "stop"],
    ["no depth to search", { maxDepth: 0 }, {}, "completed"],
  ] as const)("falls back to the level 1 move with %s", (_, budget, overrides, stoppedBy) => {
    const choice = search(pos, overrides, budget);
    expect(choice).toMatchObject({ depth: 0, reason: "heuristic", stoppedBy });
    expect(isFree(pos, choice.cell)).toBe(true);
  });

  it("before the first result ignores the soft target, after it stops between iterations", () => {
    const choice = search(pos, {}, { softMs: 0, maxDepth: 6 });
    expect(choice).toMatchObject({ reason: "search", depth: 1, stoppedBy: "soft" });
  });

  it("past the soft target abandons the running iteration and plays the last completed one", () => {
    const depths: number[] = [];
    let justIterated = false;
    // Every check between iterations (right after onIteration) sees time 0; in-search checks
    // after the first result see 100.
    const now = () => {
      if (justIterated) {
        justIterated = false;
        return 0;
      }
      return depths.length > 0 ? 100 : 0;
    };
    const onIteration = (partial: MoveChoice) => {
      depths.push(partial.depth);
      justIterated = true;
    };
    const choice = search(pos, { now, onIteration }, { softMs: 50, maxDepth: 10, maxNodes: undefined });
    expect(choice).toMatchObject({ reason: "search", depth: depths.at(-1), stoppedBy: "soft" });
    expect(choice.depth).toBeLessThan(10);
    expect(choice.nodes % CHECK_INTERVAL).toBe(0);
  });

  it("past the ceiling plays the last completed iteration", () => {
    let time = 0;
    const depths: number[] = [];
    const onIteration = (partial: MoveChoice) => {
      depths.push(partial.depth);
      time = 1000;
    };
    const choice = search(pos, { now: () => time, onIteration }, { ceilingMs: 500, maxDepth: 10, maxNodes: undefined });
    expect(choice).toMatchObject({ reason: "search", depth: depths.at(-1), stoppedBy: "ceiling" });
    expect(choice.depth).toBeLessThan(10);
  });

  it("is exported as searchLevel2 for a prepared board", () => {
    const board = new EngineBoard();
    board.place(cellOf(7, 7), 0);
    board.place(cellOf(8, 8), 1);
    const input: ChooseMoveInput = { position: position([], []), level: 2, budget: { ...BUDGET, maxDepth: 2 }, rng: createRng(1), now: () => 0 };
    const choice = searchLevel2(board, 0 as Side, input);
    expect(board.cells[choice.cell]).toBe(0);
  });
});

describe("mate scores in the transposition table", () => {
  it("are stored relative to the node and read back relative to the new ply", () => {
    expect(toTableScore(WIN_SCORE - 5, 3)).toBe(WIN_SCORE - 2);
    expect(fromTableScore(WIN_SCORE - 2, 1)).toBe(WIN_SCORE - 3);
    expect(toTableScore(-(WIN_SCORE - 5), 3)).toBe(-(WIN_SCORE - 2));
    expect(fromTableScore(-(WIN_SCORE - 2), 1)).toBe(-(WIN_SCORE - 3));
  });

  it("leave ordinary scores as they are", () => {
    expect(toTableScore(1234, 3)).toBe(1234);
    expect(fromTableScore(-1234, 3)).toBe(-1234);
  });
});
