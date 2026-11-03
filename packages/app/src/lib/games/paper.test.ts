import type { PaperView } from "@gomoku/core";
import { describe, expect, it } from "vitest";

import { FIRST_STONE, lastPaperMove, opponentPaperMove, PAPER_LABELS, paperColors, paperRules, refusalText } from "./paper";

const move = (n: number, x: number, y: number, seat: 1 | 2, auto = false) => ({ n, x, y, seat, auto, at: "2026-11-03T10:00:00.000Z" });
const paper = (moves: PaperView["moves"]): PaperView => ({ moveCount: moves.length, moves, scores: [0, 0], fives: [], autoSeat: null, autoMoveAt: null });

describe("PAPER_LABELS", () => {
  const cell = (over: Partial<Parameters<typeof PAPER_LABELS.cell>[0]> = {}) =>
    PAPER_LABELS.cell({ x: 1, y: -2, state: "empty", allowed: true, last: false, auto: false, selected: false, ...over });

  it("names a cell with every property that matters", () => {
    expect(cell()).toBe("Pole 1, -2, puste");
    expect(cell({ allowed: false })).toBe("Pole 1, -2, puste, za daleko od kamieni");
    expect(cell({ state: "black", last: true, auto: true, selected: true, allowed: false })).toBe(
      "Pole 1, -2, czarny kamień, ostatni ruch, postawiony przez automat, zaznaczone",
    );
    expect(cell({ state: "white" })).toBe("Pole 1, -2, biały kamień");
  });

  it("announces the automat and the opponent marker", () => {
    expect(PAPER_LABELS.autoMoved({ x: 3, y: 4 })).toBe("Automat postawił kamień na polu 3, 4");
    expect(PAPER_LABELS.opponentMarker({ dx: 1, dy: -1 })).toBe("Ruch przeciwnika ↗");
    expect(PAPER_LABELS.opponentMarker({ dx: -1, dy: 0 })).toBe("Ruch przeciwnika ←");
    expect(PAPER_LABELS.level(15)).toBe("15 × 15 pól");
  });
});

describe("paperColors", () => {
  it("follows the black seat, seat 1 first before the draw", () => {
    expect(paperColors(1)).toEqual({ 1: "black", 2: "white" });
    expect(paperColors(2)).toEqual({ 1: "white", 2: "black" });
    expect(paperColors(null)).toEqual({ 1: "black", 2: "white" });
  });
});

describe("last moves", () => {
  const sheet = paper([move(1, 50, 50, 1), move(2, 51, 50, 2), move(3, 52, 50, 1, true)]);

  it("finds the last stone and the last stone that is not the viewer's", () => {
    expect(lastPaperMove(sheet)).toMatchObject({ x: 52, y: 50 });
    expect(opponentPaperMove(sheet, 1)).toMatchObject({ x: 51, y: 50 });
    expect(opponentPaperMove(sheet, 2)).toMatchObject({ x: 52, y: 50 });
    expect(lastPaperMove(paper([]))).toBeUndefined();
    expect(opponentPaperMove(paper([move(1, 50, 50, 1)]), 1)).toBeUndefined();
  });
});

describe("rules of the sheet", () => {
  const stones = [{ x: 50, y: 50, seat: 1 as const, auto: false }];
  const rules = paperRules(stones);

  it("allows empty fields within three of a stone only", () => {
    expect(rules.allowed({ x: 53, y: 50 })).toBe(true);
    expect(rules.allowed({ x: 54, y: 50 })).toBe(false);
    expect(rules.allowed({ x: 50, y: 50 })).toBe(false);
  });

  it("explains a refusal in words", () => {
    expect(refusalText(rules, { x: 53, y: 53 })).toBe("");
    expect(refusalText(rules, { x: 50, y: 50 })).toBe("To pole jest już zajęte.");
    expect(refusalText(rules, { x: 60, y: 50 })).toBe("Za daleko od kamieni: najwyżej 3 pola od innego.");
    expect(refusalText(rules, { x: 101, y: 50 })).toBe("To pole jest poza planszą.");
    expect(refusalText(paperRules([]), { x: 10, y: 10 })).toBe("Pierwszy kamień trafia na środek planszy.");
    expect(refusalText(paperRules([]), FIRST_STONE)).toBe("");
  });
});
