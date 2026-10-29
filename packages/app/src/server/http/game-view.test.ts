import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveParticipant, getState } = vi.hoisted(() => ({ resolveParticipant: vi.fn(), getState: vi.fn() }));
vi.mock("./participant", () => ({ resolveParticipant }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { gameService: { getState } } }),
}));

import { loadGameView } from "./game-view";

const base = {
  status: "waiting",
  you: { seat: 1, kind: "account" },
  players: [{ seat: 1, kind: "account", displayName: "Ala_7", seen: true }],
};

beforeEach(() => {
  resolveParticipant.mockReset().mockResolvedValue({ gameId: "g1", participant: { playerId: "p1" } });
  getState.mockReset().mockResolvedValue(base);
});

describe("loadGameView", () => {
  it("reads the state for the resolved participant", async () => {
    expect(await loadGameView("g1")).toEqual(base);
    expect(getState).toHaveBeenCalledWith({ playerId: "p1" }, "g1");
  });

  it("serializes the expiry of the invitation", async () => {
    const expiresAt = new Date("2026-10-30T10:00:00Z");
    getState.mockResolvedValue({ ...base, invitation: { code: "ABCD-EFGH", url: "http://x/invite/ABCD-EFGH", expiresAt } });
    expect((await loadGameView("g1"))!.invitation).toEqual({
      code: "ABCD-EFGH",
      url: "http://x/invite/ABCD-EFGH",
      expiresAt: "2026-10-30T10:00:00.000Z",
    });
  });

  it.each([["resolving", () => resolveParticipant], ["reading", () => getState]])(
    "is null when %s answers 404",
    async (_name, mock) => {
      mock().mockRejectedValue(new NotFoundError("x"));
      expect(await loadGameView("g1")).toBeNull();
    },
  );

  it("lets other errors through", async () => {
    getState.mockRejectedValue(new Error("db down"));
    await expect(loadGameView("g1")).rejects.toThrow("db down");
  });
});
