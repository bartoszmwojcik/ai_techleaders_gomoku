import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveSpectator, getState } = vi.hoisted(() => ({ resolveSpectator: vi.fn(), getState: vi.fn() }));
vi.mock("./spectator", () => ({ resolveSpectator }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { spectatorService: { getState } } }),
}));

import { loadSpectatorView } from "./spectator-view";

const state = { status: "active", moves: [1], moveCount: 1 };

beforeEach(() => {
  resolveSpectator.mockReset().mockResolvedValue({ gameId: "g1", spectator: { spectatorId: "s1" } });
  getState.mockReset().mockResolvedValue(state);
});

describe("loadSpectatorView", () => {
  it("reads the state for the resolved spectator", async () => {
    expect(await loadSpectatorView("g1")).toEqual(state);
    expect(getState).toHaveBeenCalledWith({ spectatorId: "s1" }, "g1");
  });

  it("carries the end of a finished game as an ISO string", async () => {
    getState.mockResolvedValue({ ...state, status: "finished", finishedAt: new Date("2026-11-02T10:00:00Z") });
    expect(await loadSpectatorView("g1")).toMatchObject({ finishedAt: "2026-11-02T10:00:00.000Z" });
  });

  it("is null for somebody who does not watch the game, in the guard or in the read", async () => {
    resolveSpectator.mockRejectedValue(new NotFoundError("x"));
    expect(await loadSpectatorView("g1")).toBeNull();
    resolveSpectator.mockResolvedValue({ gameId: "g1", spectator: { spectatorId: "s1" } });
    getState.mockRejectedValue(new NotFoundError("x"));
    expect(await loadSpectatorView("g1")).toBeNull();
  });

  it("does not hide other errors", async () => {
    getState.mockRejectedValue(new Error("db down"));
    await expect(loadSpectatorView("g1")).rejects.toThrow("db down");
  });
});
