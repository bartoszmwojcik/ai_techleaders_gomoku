import { describe, expect, it } from "vitest";

import { rematchModeOf } from "./rematch";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const later = "2026-10-30T12:05:00.000Z";
const earlier = "2026-10-30T11:59:59.000Z";
const offer = (over = {}) => ({ state: "pending" as const, offeredBySeat: 1 as const, expiresAt: later, gameId: null, ...over });

describe("rematchModeOf", () => {
  it("is none while nobody offered", () => {
    expect(rematchModeOf(undefined, 1, NOW, false)).toEqual({ kind: "none" });
  });

  it("tells the proposer's wait from the opponent's offer, with the time it ends", () => {
    expect(rematchModeOf(offer(), 1, NOW, false)).toEqual({ kind: "mine", expiresAt: Date.parse(later) });
    expect(rematchModeOf(offer(), 2, NOW, false)).toEqual({ kind: "theirs", expiresAt: Date.parse(later) });
  });

  it("reads a pending offer past its time as expired, as the server does", () => {
    expect(rematchModeOf(offer({ expiresAt: earlier }), 1, NOW, false)).toEqual({ kind: "expired" });
    expect(rematchModeOf(offer({ expiresAt: new Date(NOW).toISOString() }), 2, NOW, false)).toEqual({ kind: "expired" });
    expect(rematchModeOf(offer({ state: "expired" }), 2, NOW, false)).toEqual({ kind: "expired" });
  });

  it("shows a refusal to the proposer only, and not after the proposer withdrew it", () => {
    expect(rematchModeOf(offer({ state: "declined" }), 1, NOW, false)).toEqual({ kind: "declined" });
    expect(rematchModeOf(offer({ state: "declined" }), 1, NOW, true)).toEqual({ kind: "none" });
    expect(rematchModeOf(offer({ state: "declined" }), 2, NOW, false)).toEqual({ kind: "none" });
  });

  it("carries the new game once accepted, and is none when that game is gone", () => {
    expect(rematchModeOf(offer({ state: "accepted", gameId: "g2" }), 2, NOW, false)).toEqual({ kind: "accepted", gameId: "g2" });
    expect(rematchModeOf(offer({ state: "accepted", gameId: null }), 2, NOW, false)).toEqual({ kind: "none" });
  });
});
