import type { GameReview } from "@gomoku/core";
import { describe, expect, it } from "vitest";

import { isPaperReview, lastMoveAt, neutralOutcomeOf, reviewOutcomeOf, stepStatus, stonesAt, winLineAt } from "./review";

const review = (over: Partial<GameReview> = {}): GameReview => ({
  gameId: "g",
  variant: "classic",
  finishedAt: "2026-11-02T10:00:00.000Z",
  blackSeat: 1,
  moves: [112, 113, 127],
  result: { winnerSeat: 1, reason: "five_in_row", winLine: [1, 2, 3, 4, 5] },
  players: [
    { seat: 1, kind: "account", displayName: "Ala" },
    { seat: 2, kind: "guest", displayName: "Bob" },
  ],
  viewerSeat: 1,
  ...over,
});

describe("position at a step", () => {
  it("shows the first N moves, black first", () => {
    expect(stonesAt(review(), 0)).toEqual([]);
    expect(stonesAt(review(), 2)).toEqual([
      { cell: 112, color: "black" },
      { cell: 113, color: "white" },
    ]);
  });

  it("marks the last move, none on the empty board", () => {
    expect(lastMoveAt(review(), 0)).toBeUndefined();
    expect(lastMoveAt(review(), 2)).toBe(113);
  });

  it("draws the winning line only on the last step", () => {
    expect(winLineAt(review(), 2)).toBeUndefined();
    expect(winLineAt(review(), 3)).toEqual([1, 2, 3, 4, 5]);
    expect(winLineAt(review({ result: { winnerSeat: 1, reason: "resignation", winLine: null } }), 3)).toBeUndefined();
  });
});

describe("stepStatus", () => {
  it("names the move, its colour and its cell", () => {
    expect(stepStatus(review(), 2)).toBe("Ruch 2 z 3: biały, kolumna I, rząd 8");
    expect(stepStatus(review(), 3)).toBe("Ruch 3 z 3: czarny, kolumna H, rząd 9");
  });

  it("says the board is empty at the start", () => {
    expect(stepStatus(review(), 0)).toBe("Początek partii — plansza jest pusta");
  });
});

describe("reviewOutcomeOf", () => {
  it("speaks to a reader who played, from their seat", () => {
    expect(reviewOutcomeOf(review()).title).toBe("Wygrałeś");
    expect(reviewOutcomeOf(review({ viewerSeat: 2 })).title).toBe("Przegrałeś");
  });

  it("says who won, by colour and name, to a reader who did not play", () => {
    expect(reviewOutcomeOf(review({ viewerSeat: null }))).toEqual({
      result: "win",
      title: "Wygrały czarne: Ala",
      detail: "Pięć kamieni w jednej linii.",
    });
    const white = reviewOutcomeOf(
      review({ viewerSeat: null, blackSeat: 2, result: { winnerSeat: 1, reason: "timeout", winLine: null } }),
    );
    expect(white.title).toBe("Wygrały białe: Ala");
    expect(white.detail).toBe("Przeciwnikowi skończył się czas.");
  });

  it("calls a game without a winner a draw for everybody", () => {
    const draw = { winnerSeat: null, reason: "draw", winLine: null } as const;
    expect(reviewOutcomeOf(review({ result: draw })).result).toBe("draw");
    expect(reviewOutcomeOf(review({ result: draw, viewerSeat: null }))).toMatchObject({ result: "draw", title: "Remis" });
  });
});

describe("the paper game", () => {
  const players = review().players;

  it("recognises a paper game by its variant, however it ended", () => {
    expect(isPaperReview(review({ variant: "paper", result: { winnerSeat: 1, reason: "resignation", winLine: null } }))).toBe(true);
    expect(isPaperReview(review())).toBe(false);
  });

  it("tells a win on points to the reader who did not play, with the winner's points first", () => {
    const result = { winnerSeat: 2 as const, reason: "points" as const, winLine: null, scores: [3, 7] as [number, number] };
    expect(neutralOutcomeOf({ result, blackSeat: 1, players })).toEqual({
      result: "win",
      title: "Wygrały białe: Bob (gość) · 7 : 3",
      detail: "Wygrał wyższy wynik punktowy.",
    });
  });

  it("names the winner by mark in the paper game, for a spectator and for a reader who did not play", () => {
    const result = { winnerSeat: 2 as const, reason: "points" as const, winLine: null, scores: [3, 7] as [number, number] };
    expect(neutralOutcomeOf({ result, blackSeat: 1, players, variant: "paper" }).title).toBe("Wygrało kółko: Bob (gość) · 7 : 3");
    expect(neutralOutcomeOf({ result, blackSeat: 2, players, variant: "paper" }).title).toBe("Wygrał krzyżyk: Bob (gość) · 7 : 3");
    expect(reviewOutcomeOf(review({ variant: "paper", viewerSeat: null, result }))).toMatchObject({ title: "Wygrało kółko: Bob (gość) · 7 : 3" });
  });


  it("tells a draw on points, with and without the points", () => {
    const result = { winnerSeat: null, reason: "points" as const, winLine: null };
    expect(neutralOutcomeOf({ result, blackSeat: 1, players })).toEqual({ result: "draw", title: "Remis", detail: "Punkty były równe." });
    expect(neutralOutcomeOf({ result: { ...result, scores: [4, 4] }, blackSeat: 1, players }).title).toBe("Remis 4 : 4");
  });

  it("keeps the classic texts for a classic draw and a classic win", () => {
    expect(neutralOutcomeOf({ result: { winnerSeat: null, reason: "draw", winLine: null }, blackSeat: 1, players }).detail).toBe(
      "Plansza jest pełna, nikt nie ułożył pięciu kamieni.",
    );
    expect(neutralOutcomeOf({ result: { winnerSeat: 1, reason: "five_in_row", winLine: [1] }, blackSeat: 1, players }).title).toBe("Wygrały czarne: Ala");
  });
});
