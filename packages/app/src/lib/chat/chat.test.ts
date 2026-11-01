import { afterEach, describe, expect, it, vi } from "vitest";

import { isReadable, mergeMessages, messageTime, newClientId, pluralChars, pluralNew } from "./chat";

const message = (id: number, text = `m${id}`) => ({ id, seat: 1 as const, text, createdAt: "2026-11-01T10:00:00.000Z" });

afterEach(() => vi.unstubAllGlobals());

describe("isReadable", () => {
  it("shows the conversation when the chat is open or the opponent turned it off, not otherwise", () => {
    expect(isReadable("open")).toBe(true);
    expect(isReadable("disabled_by_opponent")).toBe(true);
    for (const state of ["disabled_by_you", "unavailable", "closed"] as const) expect(isReadable(state)).toBe(false);
  });
});

describe("mergeMessages", () => {
  it("adds by number, ascending, without duplicates, and takes the newer copy", () => {
    expect(mergeMessages([message(1), message(3)], [message(2), message(3, "nowa")])).toEqual([
      message(1),
      message(2),
      message(3, "nowa"),
    ]);
    expect(mergeMessages([], [])).toEqual([]);
  });
});

describe("messageTime", () => {
  it("prints hours and minutes with a leading zero", () => {
    const date = new Date(2026, 10, 1, 7, 5);
    expect(messageTime(date.toISOString())).toBe("07:05");
  });
});

describe("pluralChars", () => {
  it.each([
    [0, "znaków"], [1, "znak"], [2, "znaki"], [4, "znaki"], [5, "znaków"], [12, "znaków"], [14, "znaków"],
    [22, "znaki"], [100, "znaków"], [112, "znaków"],
  ])("%i %s", (count, word) => expect(pluralChars(count)).toBe(word));
});

describe("pluralNew", () => {
  it.each([
    [1, "nowa"], [2, "nowe"], [3, "nowe"], [5, "nowych"], [12, "nowych"], [22, "nowe"], [0, "nowych"],
  ])("%i %s", (count, word) => expect(pluralNew(count)).toBe(word));
});

describe("newClientId", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("uses randomUUID when the page has it", () => {
    expect(newClientId()).toMatch(UUID);
    const randomUUID = vi.fn(() => "fixed");
    vi.stubGlobal("crypto", { randomUUID, getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(newClientId()).toBe("fixed");
  });

  it("falls back to a version 4 uuid from getRandomValues on a page without a secure context", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const a = newClientId();
    expect(a).toMatch(UUID);
    expect(newClientId()).not.toBe(a);
  });
});
