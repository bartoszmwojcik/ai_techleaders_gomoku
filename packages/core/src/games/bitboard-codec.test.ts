import { describe, expect, it } from "vitest";

import { createBitboard, hasStone, withStone } from "./board";
import { decodeBitboard, decodeMoves, encodeBitboard, encodeMoves } from "./bitboard-codec";

describe("bitboard codec", () => {
  it("round-trips empty, full and sparse boards", () => {
    expect(encodeBitboard(createBitboard())).toBe("0".repeat(225));
    expect(decodeBitboard("0".repeat(225))).toEqual(createBitboard());

    const full = "1".repeat(225);
    expect(encodeBitboard(decodeBitboard(full))).toBe(full);

    const sparse = [0, 7, 8, 224].reduce(withStone, createBitboard());
    const bits = encodeBitboard(sparse);
    expect(bits[0]).toBe("1");
    expect(bits[1]).toBe("0");
    expect(bits[224]).toBe("1");
    expect(decodeBitboard(bits)).toEqual(sparse);
    expect(hasStone(decodeBitboard(bits), 8)).toBe(true);
  });

  it("rejects a wrong length or alphabet", () => {
    expect(() => decodeBitboard("0".repeat(224))).toThrow();
    expect(() => decodeBitboard("0".repeat(226))).toThrow();
    expect(() => decodeBitboard("2".repeat(225))).toThrow();
  });

  it("round-trips the move log, byte 0x00 included", () => {
    const bytes = encodeMoves([0, 112, 224]);
    expect(Array.from(bytes)).toEqual([0, 112, 224]);
    expect(decodeMoves(bytes)).toEqual([0, 112, 224]);
    expect(decodeMoves(encodeMoves([]))).toEqual([]);
    expect(decodeMoves(encodeMoves(Array.from({ length: 225 }, (_, i) => i)))).toHaveLength(225);
  });

  it("rejects a log that is too long or holds a non-cell", () => {
    expect(() => encodeMoves([225])).toThrow();
    expect(() => encodeMoves(new Array(226).fill(0))).toThrow();
    expect(() => decodeMoves(Uint8Array.from([1, 255]))).toThrow();
    expect(() => decodeMoves(new Uint8Array(226))).toThrow();
  });
});
