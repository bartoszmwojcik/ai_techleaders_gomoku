import { describe, expect, it } from "vitest";

import type { GameView } from "@/server/http/game-view";

import { cellLabel, cellName, colorOfSeat, mergeState, moveOf, outcomeOf, playerName, playerNameOf, stonesOf } from "./play";

const view = (over: Partial<GameView> = {}): GameView => ({
  status: "active",
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

describe("moveOf", () => {
  it("turns a cell into the body of a move", () => {
    expect(moveOf(2 * 15 + 3, 7)).toEqual({ x: 3, y: 2, moveNumber: 7 });
  });
});

describe("colorOfSeat", () => {
  it("is null before the draw and follows the black seat after it", () => {
    expect(colorOfSeat(null, 1)).toBeNull();
    expect(colorOfSeat(2, 2)).toBe("black");
    expect(colorOfSeat(2, 1)).toBe("white");
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
