import { describe, expect, it } from "vitest";

import {
  BOUND_EXACT,
  BOUND_LOWER,
  BOUND_UPPER,
  TT_ENTRY_BYTES,
  TT_MAX_DEPTH,
  TranspositionTable,
} from "./transposition-table";

describe("TranspositionTable size", () => {
  it.each([
    [0, 0],
    [-5, 0],
    [15, 0],
    [16, 1],
    [100, 4],
    [1 << 20, 65536],
  ])("%i bytes give %i entries and never allocate more than asked", (bytes, entries) => {
    const table = new TranspositionTable(bytes);
    expect(table.entries).toBe(entries);
    expect(table.bytes).toBe(entries * TT_ENTRY_BYTES);
    expect(table.bytes).toBeLessThanOrEqual(Math.max(0, bytes));
  });

  it("a table of zero entries stores nothing and finds nothing", () => {
    const table = new TranspositionTable(0);
    expect(table.store(1, 2, 3, BOUND_EXACT, 4, 5, 1)).toBe(false);
    expect(table.probe(1, 2)).toBe(-1);
  });
});

describe("TranspositionTable entries", () => {
  it("returns what was stored, including negative scores and no move", () => {
    const table = new TranspositionTable(1024);
    expect(table.store(-7, 99, 5, BOUND_LOWER, -123_456, 224, 3)).toBe(true);
    const slot = table.probe(-7, 99);
    expect(slot).not.toBe(-1);
    expect([table.depthAt(slot), table.boundAt(slot), table.scoreAt(slot), table.moveAt(slot)]).toEqual([5, BOUND_LOWER, -123_456, 224]);

    table.store(8, 100, 0, BOUND_UPPER, 1, -1, 3);
    expect(table.moveAt(table.probe(8, 100))).toBe(-1);
    expect(table.boundAt(table.probe(8, 100))).toBe(BOUND_UPPER);
  });

  it("misses an empty slot and a slot holding another key (either half differs)", () => {
    const table = new TranspositionTable(16);
    expect(table.probe(1, 1)).toBe(-1);
    table.store(1, 1, 1, BOUND_EXACT, 0, 0, 1);
    expect(table.probe(2, 1)).toBe(-1);
    expect(table.probe(1, 2)).toBe(-1);
    expect(table.probe(1, 1)).toBe(0);
  });

  it("clamps the depth to what an entry can hold", () => {
    const table = new TranspositionTable(16);
    table.store(1, 1, 100, BOUND_EXACT, 0, 0, 1);
    expect(table.depthAt(table.probe(1, 1))).toBe(TT_MAX_DEPTH);
  });
});

describe("TranspositionTable replacement (deeper or newer)", () => {
  // One entry: every key lands in the same slot.
  it("keeps a deeper entry of the same iteration", () => {
    const table = new TranspositionTable(16);
    table.store(1, 1, 4, BOUND_EXACT, 10, 0, 2);
    expect(table.store(2, 2, 3, BOUND_EXACT, 20, 0, 2)).toBe(false);
    expect(table.probe(1, 1)).toBe(0);
    expect(table.probe(2, 2)).toBe(-1);
  });

  it("replaces an entry of the same depth or shallower", () => {
    const table = new TranspositionTable(16);
    table.store(1, 1, 4, BOUND_EXACT, 10, 0, 2);
    expect(table.store(2, 2, 4, BOUND_EXACT, 20, 0, 2)).toBe(true);
    expect(table.probe(2, 2)).toBe(0);
    expect(table.store(3, 3, 6, BOUND_EXACT, 30, 0, 2)).toBe(true);
    expect(table.scoreAt(table.probe(3, 3))).toBe(30);
  });

  it("replaces a deeper entry of an earlier iteration", () => {
    const table = new TranspositionTable(16);
    table.store(1, 1, 9, BOUND_EXACT, 10, 0, 1);
    expect(table.store(2, 2, 1, BOUND_EXACT, 20, 0, 2)).toBe(true);
    expect(table.probe(1, 1)).toBe(-1);
  });
});
