import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { read, overview } = vi.hoisted(() => ({ read: vi.fn(), overview: vi.fn() }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { showService: { read, overview } } }),
}));

import { loadShowOverview, loadShowView, toShowView } from "./show-view";

const state = { status: "active", moves: [], moveCount: 0 };

beforeEach(() => {
  read.mockReset().mockResolvedValue(state);
  overview.mockReset().mockResolvedValue({ enabled: true });
});

describe("loadShowView", () => {
  it("reads the show", async () => {
    expect(await loadShowView("g1")).toEqual(state);
    expect(read).toHaveBeenCalledWith("g1");
  });

  it("carries the end of a finished show as an ISO string", () => {
    expect(toShowView({ ...state, finishedAt: new Date("2026-11-10T10:00:00Z") } as never)).toMatchObject({
      finishedAt: "2026-11-10T10:00:00.000Z",
    });
  });

  it("is null for a missing show and passes on any other error", async () => {
    read.mockRejectedValueOnce(new NotFoundError("x"));
    expect(await loadShowView("g1")).toBeNull();
    read.mockRejectedValueOnce(new Error("db"));
    await expect(loadShowView("g1")).rejects.toThrow("db");
  });
});

describe("loadShowOverview", () => {
  it("reads the console's overview", async () => {
    expect(await loadShowOverview()).toEqual({ enabled: true });
  });
});
