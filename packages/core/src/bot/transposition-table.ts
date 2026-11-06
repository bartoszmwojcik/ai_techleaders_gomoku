/** Bytes of one entry (spec: wpis 16 B) — four 32-bit words. */
export const TT_ENTRY_BYTES = 16;

export const BOUND_EXACT = 1;
export const BOUND_LOWER = 2;
export const BOUND_UPPER = 3;
export type Bound = typeof BOUND_EXACT | typeof BOUND_LOWER | typeof BOUND_UPPER;

/** Largest depth an entry can hold (6 bits). */
export const TT_MAX_DEPTH = 63;

/**
 * Bounded transposition table of level 2 (spec, „Silnik”): one `Int32Array` allocated per move,
 * never larger than `ttBytes`. The entry count is the largest power of two that fits, so the slot
 * is the low bits of the key. Entry words: key high half, key low half (the check), score, and a
 * packed word `depth | bound << 6 | (move + 1) << 8 | age << 16`; a zero packed word is an empty
 * slot. Replacement „deeper or newer”: a slot is overwritten when it is empty, comes from an
 * earlier iteration (`age`) or is not deeper than the new entry.
 */
export class TranspositionTable {
  readonly entries: number;
  readonly #data: Int32Array;
  readonly #mask: number;

  constructor(ttBytes: number) {
    const fit = Math.floor(Math.max(0, ttBytes) / TT_ENTRY_BYTES);
    this.entries = fit === 0 ? 0 : 2 ** Math.floor(Math.log2(fit));
    this.#data = new Int32Array(this.entries * 4);
    this.#mask = this.entries - 1;
  }

  /** Bytes actually allocated (never above the requested `ttBytes`). */
  get bytes(): number {
    return this.#data.byteLength;
  }

  /** Slot holding the key, or -1 (always -1 for a table of zero entries). */
  probe(hashHi: number, hashLo: number): number {
    if (this.entries === 0) return -1;
    const slot = (hashLo & this.#mask) * 4;
    const data = this.#data;
    if (data[slot + 3] !== 0 && data[slot] === hashHi && data[slot + 1] === hashLo) return slot;
    return -1;
  }

  depthAt(slot: number): number {
    return this.#data[slot + 3]! & 0x3f;
  }

  boundAt(slot: number): Bound {
    return ((this.#data[slot + 3]! >> 6) & 0x3) as Bound;
  }

  /** Best move stored with the entry, or -1. */
  moveAt(slot: number): number {
    return ((this.#data[slot + 3]! >> 8) & 0xff) - 1;
  }

  scoreAt(slot: number): number {
    return this.#data[slot + 2]!;
  }

  /** @returns whether the entry was written (the slot may keep a deeper entry of the same age) */
  store(hashHi: number, hashLo: number, depth: number, bound: Bound, score: number, move: number, age: number): boolean {
    if (this.entries === 0) return false;
    const slot = (hashLo & this.#mask) * 4;
    const data = this.#data;
    const packed = data[slot + 3]!;
    const storedAge = (packed >>> 16) & 0xff;
    const storedDepth = packed & 0x3f;
    const clamped = Math.min(depth, TT_MAX_DEPTH);
    if (packed !== 0 && storedAge === (age & 0xff) && storedDepth > clamped) return false;
    data[slot] = hashHi;
    data[slot + 1] = hashLo;
    data[slot + 2] = score;
    data[slot + 3] = clamped | (bound << 6) | ((move + 1) << 8) | ((age & 0xff) << 16);
    return true;
  }
}
