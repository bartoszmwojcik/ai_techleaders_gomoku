import { describe, expect, it } from "vitest";

import { isRematchOpen, rematchBlackSeat, rematchStatus } from "./rematch";

const now = new Date("2026-10-30T12:00:00Z");
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe("rematchBlackSeat", () => {
  it("swaps the colours", () => {
    expect(rematchBlackSeat(1)).toBe(2);
    expect(rematchBlackSeat(2)).toBe(1);
  });
});

describe("isRematchOpen", () => {
  it("is open while pending and before the deadline", () => {
    expect(isRematchOpen({ state: "pending", expiresAt: at(1) }, now)).toBe(true);
  });

  it("is closed at the deadline and after it", () => {
    expect(isRematchOpen({ state: "pending", expiresAt: at(0) }, now)).toBe(false);
    expect(isRematchOpen({ state: "pending", expiresAt: at(-1) }, now)).toBe(false);
  });

  it("is closed for every other state and for a pending offer without a deadline", () => {
    expect(isRematchOpen({ state: "accepted", expiresAt: at(1) }, now)).toBe(false);
    expect(isRematchOpen({ state: "declined", expiresAt: at(1) }, now)).toBe(false);
    expect(isRematchOpen({ state: null, expiresAt: null }, now)).toBe(false);
    expect(isRematchOpen({ state: "pending", expiresAt: null }, now)).toBe(false);
  });
});

describe("rematchStatus", () => {
  it("is null without an offer", () => {
    expect(rematchStatus({ state: null, expiresAt: null }, now)).toBeNull();
  });

  it("reads pending as pending before the deadline and as expired after it", () => {
    expect(rematchStatus({ state: "pending", expiresAt: at(1) }, now)).toBe("pending");
    expect(rematchStatus({ state: "pending", expiresAt: at(0) }, now)).toBe("expired");
  });

  it("keeps the settled states whatever the time", () => {
    expect(rematchStatus({ state: "accepted", expiresAt: at(-1) }, now)).toBe("accepted");
    expect(rematchStatus({ state: "declined", expiresAt: at(-1) }, now)).toBe("declined");
  });
});
