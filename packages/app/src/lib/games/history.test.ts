import { END_REASONS } from "@gomoku/core";
import { describe, expect, it } from "vitest";

import { opponentNameOf, REASON_LABEL, RESULT_LABEL } from "./history";

describe("history labels", () => {
  it("has a word for every result and for every reason a game can end with", () => {
    expect(RESULT_LABEL).toEqual({ win: "Wygrana", loss: "Porażka", draw: "Remis" });
    expect(Object.keys(REASON_LABEL).sort()).toEqual([...END_REASONS].sort());
    expect(REASON_LABEL.five_in_row).toBe("5 w linii");
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

  it("calls an agent Agent (BR-30), whatever name came with it", () => {
    expect(opponentNameOf({ kind: "agent", name: "x" })).toEqual({ nick: "Agent", guest: false, label: "Agent" });
  });
});
