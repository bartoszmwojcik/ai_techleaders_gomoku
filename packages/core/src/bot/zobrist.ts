import { BOARD_CELLS } from "../games/board";
import { createRng } from "./seed";

/**
 * Zobrist keys of the engine (spec, „Silnik”): a 64-bit key as two 32-bit halves, one random pair
 * per cell and colour. The table comes from a fixed seed, independent of the move's `rng`, so the
 * same position always has the same key. Index: `cell * 2 + colour` (0 = black, 1 = white).
 */
const ZOBRIST_SEED = 0x9e3779b9;

function buildTable(seed: number): Int32Array {
  const rng = createRng(seed);
  const table = new Int32Array(BOARD_CELLS * 2);
  for (let index = 0; index < table.length; index++) {
    table[index] = Math.floor(rng() * 4294967296) | 0;
  }
  return table;
}

export const ZOBRIST_HI = buildTable(ZOBRIST_SEED);
export const ZOBRIST_LO = buildTable(ZOBRIST_SEED ^ 0x5bd1e995);
