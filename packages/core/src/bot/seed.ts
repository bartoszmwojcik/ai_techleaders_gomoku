// Deterministic randomness for the bot (spec 2026-11-05-hosted-bot, R16): the seed of a move is a
// hash of the game id and the move number, so recomputing a move after a crash picks the same cell.

/** A pseudo-random generator returning numbers in `[0, 1)`. */
export type Rng = () => number;

/** 32-bit FNV-1a hash of `gameId` and the move number (1-based, the move the bot is about to make). */
export function seedOf(gameId: string, moveNumber: number): number {
  const text = `${gameId}:${moveNumber}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast and good enough for tie-breaking; the same seed gives the same sequence. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The generator for move `moveNumber` of game `gameId` (R16). */
export function rngFor(gameId: string, moveNumber: number): Rng {
  return createRng(seedOf(gameId, moveNumber));
}
