import { describe, expect, it } from "vitest";

import { LOBBY_LIST_LIMIT, LOBBY_PICK_LIMIT, LOBBY_PICK_WINDOW_MS, LOBBY_MARK_LIMIT, LOBBY_MARK_WINDOW_MS, SEEKING_TTL_MS } from "./lobby";

describe("lobby constants", () => {
  it("keeps the status for 5 minutes (BR-12) and bounds the marks and the list", () => {
    expect(SEEKING_TTL_MS).toBe(300_000);
    expect(LOBBY_MARK_LIMIT).toBe(30);
    expect(LOBBY_MARK_WINDOW_MS).toBe(3_600_000);
    expect(LOBBY_LIST_LIMIT).toBe(50);
    expect(LOBBY_PICK_LIMIT).toBe(60);
    expect(LOBBY_PICK_WINDOW_MS).toBe(3_600_000);
  });
});
