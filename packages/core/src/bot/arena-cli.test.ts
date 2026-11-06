import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";

import type { ArenaGame, ArenaResult } from "./arena";

const { runArena } = vi.hoisted(() => ({ runArena: vi.fn() }));
vi.mock("./arena", async (importOriginal) => ({ ...(await importOriginal<typeof import("./arena")>()), runArena }));

const games: ArenaGame[] = [
  { seed: 1, level2Colour: "black", winner: "black", moves: [1, 2, 3] },
  { seed: 2, level2Colour: "white", winner: "black", moves: [4, 5] },
  { seed: 3, level2Colour: "black", winner: null, moves: [6] },
];

function fakeRun(result: Omit<ArenaResult, "games">) {
  runArena.mockImplementation((_count: number, _budget: unknown, onGame: (game: ArenaGame) => void) => {
    games.forEach(onGame);
    return { games, ...result };
  });
}

let log: MockInstance<typeof console.log>;

beforeEach(() => {
  vi.resetModules();
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = undefined;
  log.mockRestore();
});

const printed = () => log.mock.calls.map(([line]) => String(line));

it("plays 100 games with the arena budget, prints every game and the R17 verdict", async () => {
  fakeRun({ total: 0.95, byColour: { black: { games: 50, score: 50 }, white: { games: 50, score: 45 } }, passed: true });

  await import("./arena-cli");

  const { ARENA_BUDGET } = await import("./arena");
  expect(runArena).toHaveBeenCalledWith(100, ARENA_BUDGET, expect.any(Function));
  const lines = printed();
  expect(lines.slice(0, 3)).toEqual([
    "partia 1: poziom 2 gra czarne, wygrywa poziom 2 po 3 ruchach",
    "partia 2: poziom 2 gra białe, wygrywa poziom 1 po 2 ruchach",
    "partia 3: poziom 2 gra czarne, remis po 1 ruchach",
  ]);
  expect(lines[3]).toMatch(/^budżet: maxNodes \d+, maxDepth \d+, ttBytes \d+; czas \d+\.\d s$/);
  expect(lines.slice(4)).toEqual([
    "poziom 2 na czarne: 50 / 50 = 1.00 (próg 0.8)",
    "poziom 2 na białe: 45 / 50 = 0.90 (próg 0.8)",
    "wynik poziomu 2: 0.95 (próg 0.9) — R17 spełnione",
  ]);
  expect(process.exitCode).toBe(0);
});

it("exits with 1 when level 2 misses R17", async () => {
  fakeRun({ total: 0.5, byColour: { black: { games: 50, score: 30 }, white: { games: 50, score: 20 } }, passed: false });

  await import("./arena-cli");

  expect(printed().at(-1)).toBe("wynik poziomu 2: 0.50 (próg 0.9) — R17 NIESPEŁNIONE");
  expect(process.exitCode).toBe(1);
});
