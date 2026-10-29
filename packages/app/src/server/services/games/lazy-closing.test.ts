import { READY_DEADLINE_MS } from "@gomoku/core";
import { describe, expect, it, vi } from "vitest";

import { CANCEL_NOT_STARTED_OF_USER, EXPIRE_WAITING_OF_USER, closeStaleSlotsOfUser } from "./lazy-closing";

describe("closeStaleSlotsOfUser", () => {
  it("expires the waiting games, then cancels the ones nobody opened in time", async () => {
    const execute = vi.fn(async () => undefined);
    const now = new Date("2026-10-29T12:00:00Z");
    await closeStaleSlotsOfUser({ execute } as never, "user-1", now);
    expect(execute.mock.calls).toEqual([
      [EXPIRE_WAITING_OF_USER, [now, "user-1"], "run"],
      [CANCEL_NOT_STARTED_OF_USER, [new Date(now.getTime() - READY_DEADLINE_MS), "user-1"], "run"],
    ]);
  });
});
