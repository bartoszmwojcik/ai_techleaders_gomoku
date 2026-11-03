import { describe, expect, it } from "vitest";

import {
  SPECTATOR_IDLE_AFTER_MS,
  SPECTATOR_IDLE_POLL_INTERVAL_MS,
  SPECTATOR_POLL_INTERVAL_MS,
  spectatorPollDelay,
} from "./spectate";

describe("spectatorPollDelay", () => {
  it("polls a live game every 2 s", () => {
    expect(spectatorPollDelay("active", 0)).toBe(SPECTATOR_POLL_INTERVAL_MS);
    expect(SPECTATOR_POLL_INTERVAL_MS).toBe(2000);
    expect(spectatorPollDelay("active", SPECTATOR_IDLE_AFTER_MS - 1)).toBe(2000);
  });

  it("slows down after a minute without a move", () => {
    expect(spectatorPollDelay("active", SPECTATOR_IDLE_AFTER_MS)).toBe(SPECTATOR_IDLE_POLL_INTERVAL_MS);
  });

  it("stops when the game is over or void", () => {
    expect(spectatorPollDelay("finished", 0)).toBeNull();
    expect(spectatorPollDelay("cancelled", 0)).toBeNull();
  });
});
