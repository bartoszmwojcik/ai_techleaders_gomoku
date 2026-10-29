import { describe, expect, it } from "vitest";

import { INITIAL_CLOCK_MS, INVITATION_TTL_MS, READY_DEADLINE_MS } from "./constants";
import {
  END_REASONS,
  GAME_COLORS,
  GAME_ORIGINS,
  GAME_STATUSES,
  PARTICIPANT_KINDS,
  REMATCH_STATES,
  SEATS,
} from "./types";

describe("game domain constants", () => {
  it("lists the lifecycle, origins, kinds, seats and rematch states", () => {
    expect(GAME_STATUSES).toEqual(["waiting", "active", "finished", "cancelled"]);
    expect(GAME_ORIGINS).toEqual(["invite", "lobby", "rematch"]);
    expect(PARTICIPANT_KINDS).toEqual(["account", "guest"]);
    expect(SEATS).toEqual([1, 2]);
    expect(REMATCH_STATES).toEqual(["pending", "accepted", "declined"]);
    expect(GAME_COLORS).toEqual(["black", "white"]);
    expect(END_REASONS).toEqual(["five_in_row", "draw", "timeout", "resignation"]);
  });

  it("keeps the agreed durations", () => {
    expect(INVITATION_TTL_MS).toBe(24 * 3600_000);
    expect(READY_DEADLINE_MS).toBe(15 * 60_000);
    expect(INITIAL_CLOCK_MS).toBe(600_000);
  });
});
