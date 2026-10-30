import { describe, expect, it } from "vitest";

import { resolveResignation } from "./resign";

describe("resolveResignation", () => {
  it("makes the opponent the winner by resignation", () => {
    expect(resolveResignation("active", 1)).toEqual({
      ok: true,
      result: { winnerSeat: 2, reason: "resignation" },
    });
    expect(resolveResignation("active", 2)).toEqual({
      ok: true,
      result: { winnerSeat: 1, reason: "resignation" },
    });
  });

  it("refuses a finished game", () => {
    expect(resolveResignation("finished", 1)).toEqual({ ok: false, reason: "finished" });
  });

  it("refuses a waiting or cancelled game as not active", () => {
    expect(resolveResignation("waiting", 1)).toEqual({ ok: false, reason: "not_active" });
    expect(resolveResignation("cancelled", 2)).toEqual({ ok: false, reason: "not_active" });
  });
});
