import { describe, expect, it } from "vitest";

import { deriveChatState } from "./state";

const open = { windowOpen: true, mine: true, theirs: true as boolean | null };

describe("deriveChatState", () => {
  it.each([["waiting"], ["cancelled"]] as const)("is unavailable in a %s game", (status) => {
    expect(deriveChatState({ ...open, status })).toBe("unavailable");
  });

  it("is open in an active game and in a finished one within the window", () => {
    expect(deriveChatState({ ...open, status: "active", windowOpen: false })).toBe("open");
    expect(deriveChatState({ ...open, status: "finished" })).toBe("open");
  });

  it("is closed once the window of a finished game has passed, whatever the settings", () => {
    expect(deriveChatState({ ...open, status: "finished", windowOpen: false })).toBe("closed");
    expect(deriveChatState({ ...open, status: "finished", windowOpen: false, mine: false })).toBe("closed");
  });

  it("tells who turned the chat off; your own choice wins when both did", () => {
    expect(deriveChatState({ ...open, status: "active", mine: false })).toBe("disabled_by_you");
    expect(deriveChatState({ ...open, status: "active", theirs: false })).toBe("disabled_by_opponent");
    expect(deriveChatState({ ...open, status: "active", mine: false, theirs: false })).toBe("disabled_by_you");
    expect(deriveChatState({ ...open, status: "active", theirs: null })).toBe("open");
  });
});
