import { describe, expect, it } from "vitest";

import type { GameView } from "@/server/http/game-view";

import { cellLabel, cellName, colorOfSeat, knownMoves, mergeState, outcomeOf, paperStonesOf, playerName, playerNameOf, sideWords, stonesOf } from "./play";

const view = (over: Partial<GameView> = {}): GameView => ({
  status: "active",
  variant: "classic",
  timeControlMs: 600_000,
  you: { seat: 1, kind: "account" },
  players: [],
  moveCount: 0,
  blackSeat: 1,
  turnSeat: 1,
  moves: [],
  result: null,
  clock: { remainingMs: [600_000, 600_000] as [number, number], running: null, now: 0 },
  ...over,
});

describe("stonesOf", () => {
  it("alternates colours, black first", () => {
    expect(stonesOf([112, 113, 127])).toEqual([
      { cell: 112, color: "black" },
      { cell: 113, color: "white" },
      { cell: 127, color: "black" },
    ]);
  });
});

describe("mergeState", () => {
  it("appends the new moves to the known ones", () => {
    const merged = mergeState(view({ moveCount: 2, moves: [1, 2] }), view({ moveCount: 4, moves: [3, 4] }), 2);
    expect(merged.moves).toEqual([1, 2, 3, 4]);
    expect(merged.moveCount).toBe(4);
  });

  it("lets the newer response win where it overlaps the known moves", () => {
    const merged = mergeState(view({ moveCount: 3, moves: [1, 2, 3] }), view({ moveCount: 4, moves: [3, 4] }), 2);
    expect(merged.moves).toEqual([1, 2, 3, 4]);
  });

  it("keeps the current state when the response is older than what the client holds", () => {
    const current = view({ moveCount: 3, moves: [1, 2, 3] });
    expect(mergeState(current, view({ moveCount: 2, moves: [] }), 2)).toBe(current);
  });

  it("never reopens a finished game: a late 'active' response with the same move count is dropped", () => {
    const current = view({ status: "finished", moveCount: 3, moves: [1, 2, 3] });
    expect(mergeState(current, view({ status: "active", moveCount: 3, moves: [] }), 3)).toBe(current);
  });

  it("takes a 'finished' response over an active state, also without a new move", () => {
    const merged = mergeState(
      view({ moveCount: 3, moves: [1, 2, 3] }),
      view({ status: "finished", moveCount: 3, moves: [] }),
      3,
    );
    expect(merged.status).toBe("finished");
    expect(merged.moves).toEqual([1, 2, 3]);
  });
});

describe("colorOfSeat", () => {
  it("is null before the draw and follows the black seat after it", () => {
    expect(colorOfSeat(null, 1)).toBeNull();
    expect(colorOfSeat(2, 2)).toBe("black");
    expect(colorOfSeat(2, 1)).toBe("white");
  });
});

describe("sideWords", () => {
  it("names the sides by colour in the classic game and by mark in the paper one (black = ×, white = ○)", () => {
    expect(sideWords("classic").plays).toEqual({ black: "czarnymi", white: "białymi" });
    expect(sideWords("classic").place.white).toBe("Postaw kamień");
    expect(sideWords("paper").plays).toEqual({ black: "krzyżykiem", white: "kółkiem" });
    expect(sideWords("paper").place).toEqual({ black: "Postaw krzyżyk", white: "Postaw kółko" });
    expect(sideWords("paper").rematchOffer).toBe("Znaki zostaną zamienione.");
    expect(sideWords(undefined)).toBe(sideWords("classic"));
  });

  it("has no word for a colour or a stone in the paper set", () => {
    expect(JSON.stringify(sideWords("paper"))).not.toMatch(/kamie|czarn|biał|kolor/i);
  });
});

describe("labels", () => {
  it("names the cells for screen readers", () => {
    expect(cellLabel({ column: "C", row: 7, state: "empty" })).toBe("Kolumna C, rząd 7, puste");
    expect(cellLabel({ column: "A", row: 1, state: "black" })).toBe("Kolumna A, rząd 1, czarny kamień");
    expect(cellLabel({ column: "O", row: 15, state: "white" })).toBe("Kolumna O, rząd 15, biały kamień");
    expect(cellName(6 * 15 + 2)).toBe("Kolumna C, rząd 7");
  });

  it("names the players", () => {
    expect(playerName({ seat: 1, kind: "account", displayName: "Ala_7", seen: true })).toBe("Ala_7");
    expect(playerName({ seat: 2, kind: "guest", displayName: "Piotr", seen: true })).toBe("Piotr (gość)");
    expect(playerName({ seat: 2, kind: "guest", displayName: "Gracz 2", seen: true })).toBe("Gracz 2 (gość)");
    expect(playerNameOf({ seat: 2, kind: "guest", displayName: "Piotr", seen: true })).toEqual({
      nick: "Piotr",
      guest: true,
      label: "Piotr (gość)",
    });
    expect(playerName({ seat: 2, kind: "account", displayName: null, seen: true })).toBe("Usunięty gracz");
    expect(playerName(undefined)).toBe("Usunięty gracz");
  });

  it("names an agent Agent, with the declared model name marked as declared (BR-31)", () => {
    expect(playerName({ seat: 2, kind: "agent", displayName: null, agentName: null, seen: true })).toBe("Agent");
    expect(playerName({ seat: 2, kind: "agent", displayName: null, seen: true })).toBe("Agent");
    expect(
      playerName({ seat: 2, kind: "agent", displayName: null, agentName: "claude opus 5.5", seen: true }),
    ).toBe("Agent · claude opus 5.5 (deklarowane)");
    expect(
      playerNameOf({ seat: 2, kind: "agent", displayName: null, agentName: "gpt-5", seen: true }),
    ).toEqual({ nick: "Agent", guest: false, label: "Agent · gpt-5 (deklarowane)", agent: { declared: "gpt-5" } });
  });
});

describe("outcomeOf", () => {
  const finished = (winnerSeat: 1 | 2 | null, reason: "five_in_row" | "draw" | "timeout" | "resignation") =>
    view({ status: "finished", result: { winnerSeat, reason, winLine: null } });

  it("has no outcome while the game is on", () => {
    expect(outcomeOf(view())).toBeNull();
  });

  it("reads five in a row from the viewer's side (p06.1, p06.2)", () => {
    expect(outcomeOf(finished(1, "five_in_row"))).toMatchObject({ result: "win", title: "Wygrałeś" });
    expect(outcomeOf(finished(2, "five_in_row"))).toMatchObject({ result: "loss", title: "Przegrałeś" });
  });

  it("reads a draw the same for both (p06.4)", () => {
    expect(outcomeOf(finished(null, "draw"))).toMatchObject({ result: "draw", title: "Remis" });
  });

  it("has words for the endings of the next phases (timeout, resignation)", () => {
    expect(outcomeOf(finished(1, "timeout"))?.result).toBe("win");
    expect(outcomeOf(finished(2, "timeout"))?.result).toBe("loss");
    expect(outcomeOf(finished(1, "resignation"))?.result).toBe("win");
    expect(outcomeOf(finished(2, "resignation"))?.result).toBe("loss");
  });
});

describe("the paper game", () => {
  const at = "2026-11-03T10:00:00.000Z";
  const sheet = (moves: { n: number; x: number; y: number; seat: 1 | 2; auto: boolean; at: string }[], moveCount = moves.length) => ({
    moveCount,
    moves,
    scores: [0, 0] as [number, number],
    fives: [],
    autoSeat: null,
    autoMoveAt: null,
  });
  const m = (n: number) => ({ n, x: 50 + n, y: 50, seat: ((n % 2) + 1) as 1 | 2, auto: false, at });

  it("counts the moves of the sheet, or the classic log", () => {
    expect(knownMoves(view({ moves: [1, 2] }))).toBe(2);
    expect(knownMoves(view({ variant: "paper", paper: sheet([m(1), m(2), m(3)]) }))).toBe(3);
  });

  it("merges the moves after the known ones into paper.moves", () => {
    const current = view({ variant: "paper", moveCount: 2, paper: sheet([m(1), m(2)]) });
    const next = view({ variant: "paper", moveCount: 4, paper: sheet([m(3), m(4)], 4) });
    const merged = mergeState(current, next, 2);
    expect(merged.paper?.moves.map((move) => move.n)).toEqual([1, 2, 3, 4]);
    expect(merged.paper?.moveCount).toBe(4);
  });

  it("starts the sheet from the new moves when the client held none", () => {
    const merged = mergeState(view({ variant: "paper" }), view({ variant: "paper", moveCount: 1, paper: sheet([m(1)]) }), 0);
    expect(merged.paper?.moves).toHaveLength(1);
  });

  it("keeps the current sheet when the response is older", () => {
    const current = view({ variant: "paper", moveCount: 3, paper: sheet([m(1), m(2), m(3)]) });
    expect(mergeState(current, view({ variant: "paper", moveCount: 1, paper: sheet([], 1) }), 3)).toBe(current);
  });

  it("gives the stones for the board", () => {
    expect(paperStonesOf(sheet([m(1)]))).toEqual([{ x: 51, y: 50, seat: 2, auto: false }]);
  });

  describe("outcomeOf", () => {
    const finished = (reason: "points" | "resignation", winnerSeat: 1 | 2 | null, scores?: [number, number]) => ({
      result: { winnerSeat, reason, winLine: null, ...(scores && { scores }) },
      you: { seat: 1 as const },
    });

    it("shows the points of a win, a loss and a draw, the viewer's first", () => {
      expect(outcomeOf(finished("points", 1, [7, 5]))).toEqual({ result: "win", title: "Wygrana 7 : 5", detail: "Wynik końcowy według punktów za piątki." });
      expect(outcomeOf(finished("points", 2, [5, 7]))?.title).toBe("Przegrana 5 : 7");
      expect(outcomeOf({ ...finished("points", 2, [5, 7]), you: { seat: 2 } })?.title).toBe("Wygrana 7 : 5");
      expect(outcomeOf(finished("points", null, [4, 4]))).toMatchObject({ result: "draw", title: "Remis 4 : 4" });
    });

    it("says it plainly without the points (a review)", () => {
      expect(outcomeOf(finished("points", 1))).toEqual({ result: "win", title: "Wygrałeś na punkty", detail: "" });
      expect(outcomeOf(finished("points", 2))?.title).toBe("Przegrałeś na punkty");
      expect(outcomeOf(finished("points", null))).toEqual({ result: "draw", title: "Remis", detail: "" });
    });

    it("names a resignation of the paper game, with the points at that moment", () => {
      expect(outcomeOf(finished("resignation", 2, [3, 1]))).toEqual({
        result: "loss",
        title: "Przegrana przez poddanie",
        detail: "Wynik w chwili poddania: 3 : 1.",
      });
      expect(outcomeOf(finished("resignation", 1, [3, 1]))?.title).toBe("Wygrana — przeciwnik poddał partię");
    });
  });
});
