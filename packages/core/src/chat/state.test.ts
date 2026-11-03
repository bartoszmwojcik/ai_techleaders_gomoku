import { describe, expect, it } from "vitest";

import { deriveChatState, deriveSpectatorChatState } from "./state";

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

describe("deriveChatState in a public game", () => {
  it("keeps the chat open for the player whose opponent turned it off (BR-41), but not for the one who did", () => {
    expect(deriveChatState({ ...open, status: "active", theirs: false, isPublic: true })).toBe("open");
    expect(deriveChatState({ ...open, status: "active", mine: false, theirs: true, isPublic: true })).toBe("disabled_by_you");
    expect(deriveChatState({ ...open, status: "active", theirs: false, isPublic: false })).toBe("disabled_by_opponent");
  });
});

describe("deriveSpectatorChatState", () => {
  it.each([["waiting"], ["cancelled"]] as const)("is unavailable in a %s game", (status) => {
    expect(deriveSpectatorChatState({ status, windowOpen: true })).toBe("unavailable");
  });

  it("is open while the game is on and within the window after it, and closed after", () => {
    expect(deriveSpectatorChatState({ status: "active", windowOpen: false })).toBe("open");
    expect(deriveSpectatorChatState({ status: "finished", windowOpen: true })).toBe("open");
    expect(deriveSpectatorChatState({ status: "finished", windowOpen: false })).toBe("closed");
  });
});
