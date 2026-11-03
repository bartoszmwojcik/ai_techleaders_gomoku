import { END_REASONS } from "@gomoku/core";
import { describe, expect, it } from "vitest";

import { historyDetailOf, opponentNameOf, REASON_LABEL, RESULT_LABEL } from "./history";

describe("history labels", () => {
  it("has a word for every result and for every reason a game can end with", () => {
    expect(RESULT_LABEL).toEqual({ win: "Wygrana", loss: "Porażka", draw: "Remis" });
    expect(Object.keys(REASON_LABEL).sort()).toEqual([...END_REASONS].sort());
    expect(REASON_LABEL.five_in_row).toBe("5 w linii");
    expect(REASON_LABEL.points).toBe("Punkty");
  });
});

describe("opponentNameOf", () => {
  it("names an account by its name", () => {
    expect(opponentNameOf({ kind: "account", name: "Alicja_99" })).toEqual({ nick: "Alicja_99", guest: false, label: "Alicja_99" });
  });

  it("calls a deleted account Usunięty gracz (BR-17)", () => {
    expect(opponentNameOf({ kind: "account", name: null })).toEqual({ nick: "Usunięty gracz", guest: false, label: "Usunięty gracz" });
  });

  it("marks a guest with the suffix (BR-24)", () => {
    expect(opponentNameOf({ kind: "guest", name: "Kasia" })).toEqual({ nick: "Kasia", guest: true, label: "Kasia (gość)" });
  });

  it("calls an agent Agent (BR-31), with the model name it declared marked as such", () => {
    expect(opponentNameOf({ kind: "agent", name: null })).toEqual({
      nick: "Agent",
      guest: false,
      label: "Agent",
      agent: { declared: null },
    });
    expect(opponentNameOf({ kind: "agent", name: "claude opus 5.5" })).toEqual({
      nick: "Agent",
      guest: false,
      label: "Agent · claude opus 5.5 (deklarowane)",
      agent: { declared: "claude opus 5.5" },
    });
  });
});

describe("historyDetailOf", () => {
  it("is the reason for the classic game", () => {
    expect(historyDetailOf({ variant: "classic", reason: "timeout" })).toBe("Koniec czasu");
  });

  it("is the variant and the points for the paper game, with the reason when it was not the points", () => {
    expect(historyDetailOf({ variant: "paper", reason: "points", scores: [7, 5] })).toBe("Papier i ołówek · 7 : 5");
    expect(historyDetailOf({ variant: "paper", reason: "resignation", scores: [2, 4] })).toBe("Papier i ołówek · 2 : 4 · Poddanie");
    expect(historyDetailOf({ variant: "paper", reason: "points" })).toBe("Papier i ołówek · 0 : 0");
  });
});
