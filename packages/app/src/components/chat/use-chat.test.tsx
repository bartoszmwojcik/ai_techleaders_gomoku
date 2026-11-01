// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiCall }));

import {
  CHAT_IDLE_AFTER_MS,
  CHAT_IDLE_POLL_INTERVAL_MS,
  CHAT_POLL_INTERVAL_MS,
  CHAT_TIMEOUT_MS,
} from "@/lib/chat/chat";

import { useChat } from "./use-chat";

vi.setConfig({ testTimeout: 20_000 });

const LIMITS = { maxLength: 200, minIntervalMs: 2000 };
const message = (id: number, seat: 1 | 2 = 2) => ({ id, seat, text: `m${id}`, createdAt: "2026-11-01T10:00:00.000Z" });
const data = (state: string, messages: ReturnType<typeof message>[] = [], lastId = messages.at(-1)?.id ?? 0) => ({
  ok: true,
  data: { state, messages, lastId, limits: LIMITS },
});
const failure = (code: string, extra: Record<string, unknown> = {}) => ({ ok: false, error: { code, message: "Komunikat serwera.", ...extra } });
const onGone = vi.fn();

const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const mount = async () => {
  const hook = renderHook(() => useChat({ gameId: "g1", onGone }));
  await tick(0);
  return hook;
};
const urls = () => apiCall.mock.calls.map(([url]) => url as string);

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiCall.mockReset().mockResolvedValue(data("open"));
  onGone.mockReset();
});
afterEach(() => {
  cleanup();
  setHidden(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useChat, reading", () => {
  it("is not loaded until the first read, which asks for the latest page with a timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    apiCall.mockResolvedValue(data("open", [message(1), message(2)]));
    const hook = renderHook(() => useChat({ gameId: "g1", onGone }));
    expect(hook.result.current).toMatchObject({ loaded: false, messages: [], limits: null, state: "open", fails: 0, pending: null });
    await tick(0);

    expect(apiCall).toHaveBeenCalledWith("/api/games/g1/chat", { method: "GET", signal: expect.any(AbortSignal) });
    expect(timeout).toHaveBeenCalledWith(CHAT_TIMEOUT_MS);
    expect(hook.result.current).toMatchObject({ loaded: true, state: "open", limits: LIMITS });
    expect(hook.result.current.messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it("then asks only for what is after the cursor and merges it, every 3 seconds", async () => {
    apiCall.mockResolvedValue(data("open", [message(1)]));
    const hook = await mount();
    apiCall.mockResolvedValue(data("open", [message(2)]));
    await tick(CHAT_POLL_INTERVAL_MS);

    expect(urls()).toEqual(["/api/games/g1/chat", "/api/games/g1/chat?after_id=1"]);
    expect(hook.result.current.messages.map((m) => m.id)).toEqual([1, 2]);
    apiCall.mockResolvedValue(data("open", [], 2));
    await tick(CHAT_POLL_INTERVAL_MS);
    expect(urls().at(-1)).toBe("/api/games/g1/chat?after_id=2");
  });

  it("follows a full page with another read at once", async () => {
    const page = Array.from({ length: 50 }, (_, i) => message(i + 2));
    apiCall.mockResolvedValue(data("open", [message(1)]));
    await mount();
    apiCall.mockClear();
    apiCall.mockResolvedValueOnce(data("open", page)).mockResolvedValueOnce(data("open", [message(52)]));
    await tick(CHAT_POLL_INTERVAL_MS);

    expect(urls()).toEqual(["/api/games/g1/chat?after_id=1", "/api/games/g1/chat?after_id=51"]);
  });

  it("slows down to 10 seconds after a minute without a message, and speeds up when one comes", async () => {
    const hook = await mount();
    await tick(CHAT_IDLE_AFTER_MS);
    apiCall.mockClear();
    await tick(CHAT_POLL_INTERVAL_MS * 2);
    expect(apiCall.mock.calls.length).toBeLessThanOrEqual(1);

    apiCall.mockClear();
    await tick(CHAT_IDLE_POLL_INTERVAL_MS * 3);
    expect(apiCall.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(apiCall.mock.calls.length).toBeLessThanOrEqual(4);

    apiCall.mockResolvedValue(data("open", [message(1)]));
    await tick(CHAT_IDLE_POLL_INTERVAL_MS);
    apiCall.mockClear();
    await tick(CHAT_POLL_INTERVAL_MS * 3);
    expect(apiCall.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(hook.result.current.messages).toHaveLength(1);
  });

  it("does not read in a hidden tab and reads at once when it comes back", async () => {
    await mount();
    setHidden(true);
    apiCall.mockClear();
    await tick(CHAT_POLL_INTERVAL_MS * 3);
    expect(apiCall).not.toHaveBeenCalled();

    setHidden(false);
    await tick(0);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("never has two reads in flight", async () => {
    let finish!: (value: unknown) => void;
    apiCall.mockReset().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const hook = renderHook(() => useChat({ gameId: "g1", onGone }));
    await tick(CHAT_POLL_INTERVAL_MS * 3);
    await act(async () => void hook.result.current.refresh());
    expect(apiCall).toHaveBeenCalledTimes(1);
    finish(data("open"));
    await tick(0);
  });

  it("clears the conversation and the cursor when the chat stops being readable, and asks for the latest page when it is back", async () => {
    apiCall.mockResolvedValue(data("open", [message(1), message(2)]));
    const hook = await mount();
    apiCall.mockResolvedValue(data("disabled_by_you"));
    await tick(CHAT_POLL_INTERVAL_MS);
    expect(hook.result.current).toMatchObject({ state: "disabled_by_you", messages: [] });

    apiCall.mockResolvedValue(data("open", [message(1), message(2)]));
    await tick(CHAT_POLL_INTERVAL_MS);
    expect(urls().slice(-2)).toEqual(["/api/games/g1/chat?after_id=2", "/api/games/g1/chat"]);
    expect(hook.result.current.messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it("keeps the conversation when only the opponent turns the chat off", async () => {
    apiCall.mockResolvedValue(data("open", [message(1)]));
    const hook = await mount();
    apiCall.mockResolvedValue(data("disabled_by_opponent", [], 1));
    await tick(CHAT_POLL_INTERVAL_MS);
    expect(hook.result.current).toMatchObject({ state: "disabled_by_opponent" });
    expect(hook.result.current.messages).toHaveLength(1);
  });

  it("counts failed reads in a row, resets on success, and keeps polling", async () => {
    apiCall.mockResolvedValue(failure("network"));
    const hook = await mount();
    await tick(CHAT_POLL_INTERVAL_MS * 2);
    expect(hook.result.current.fails).toBe(3);
    expect(onGone).not.toHaveBeenCalled();

    apiCall.mockResolvedValue(data("open"));
    await tick(CHAT_POLL_INTERVAL_MS);
    expect(hook.result.current.fails).toBe(0);
  });

  it("tells the room the game is gone on a 404 and stops reading", async () => {
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    await mount();
    expect(onGone).toHaveBeenCalledTimes(1);
    apiCall.mockClear();
    await tick(CHAT_POLL_INTERVAL_MS * 3);
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("stops polling when it unmounts and uses the newest onGone", async () => {
    const hook = renderHook(({ gone }) => useChat({ gameId: "g1", onGone: gone }), { initialProps: { gone: onGone } });
    await tick(0);
    const newer = vi.fn();
    hook.rerender({ gone: newer });
    apiCall.mockResolvedValue(failure("NOT_FOUND"));
    await tick(CHAT_POLL_INTERVAL_MS);
    expect(newer).toHaveBeenCalledTimes(1);
    expect(onGone).not.toHaveBeenCalled();

    const second = renderHook(() => useChat({ gameId: "g2", onGone }));
    second.unmount();
    apiCall.mockClear();
    await tick(CHAT_POLL_INTERVAL_MS * 3);
    expect(urls().some((url) => url.includes("g2"))).toBe(false);
  });
});

describe("useChat, sending", () => {
  const sent = { ok: true, data: { message: message(7, 1), retryAfterMs: 2000 } };

  it("shows the message dimmed while it is on its way and puts it in the list when the server confirms it", async () => {
    const hook = await mount();
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    let outcome!: Promise<unknown>;
    await act(async () => void (outcome = hook.result.current.send("hej", "c1")));
    expect(hook.result.current.pending).toEqual({ clientId: "c1", text: "hej" });

    await act(async () => finish(sent));
    expect(await outcome).toEqual({ ok: true });
    expect(hook.result.current.pending).toBeNull();
    expect(hook.result.current.messages.map((m) => m.id)).toEqual([7]);
    expect(apiCall).toHaveBeenLastCalledWith("/api/games/g1/chat", {
      body: { text: "hej", clientId: "c1" },
      signal: expect.any(AbortSignal),
    });
  });

  it("sends a double click once", async () => {
    const hook = await mount();
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    apiCall.mockClear();
    let results!: unknown[];
    await act(async () => {
      const both = Promise.all([hook.result.current.send("hej", "c1"), hook.result.current.send("hej", "c1")]);
      finish(sent);
      results = await both;
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ ok: true }, { ok: false, kind: "busy" }]);
  });

  it("accepts a confirmation that arrives before the first read", async () => {
    apiCall.mockReset().mockReturnValue(new Promise(() => {}));
    const hook = renderHook(() => useChat({ gameId: "g1", onGone }));
    apiCall.mockResolvedValueOnce(sent);
    await act(async () => void (await hook.result.current.send("hej", "c1")));
    expect(hook.result.current.loaded).toBe(false);
  });

  it("answers a lost connection with the network outcome so the same attempt can be repeated", async () => {
    const hook = await mount();
    apiCall.mockResolvedValueOnce(failure("network"));
    expect(await act(() => hook.result.current.send("hej", "c1"))).toEqual({ ok: false, kind: "network" });
    expect(hook.result.current.pending).toBeNull();
  });

  it("answers 429 with the wait the server gave, or 2 seconds when it gave none", async () => {
    const hook = await mount();
    apiCall.mockResolvedValueOnce(failure("RATE_LIMITED", { data: { retryAfterMs: 1400 } }));
    expect(await act(() => hook.result.current.send("a", "c1"))).toEqual({
      ok: false,
      kind: "wait",
      message: "Komunikat serwera.",
      retryAfterMs: 1400,
    });
    apiCall.mockResolvedValueOnce(failure("RATE_LIMITED"));
    expect(await act(() => hook.result.current.send("a", "c2"))).toMatchObject({ kind: "wait", retryAfterMs: 2000 });
  });

  it("reads the chat again after a refusal of the state and passes the server's sentence on", async () => {
    const hook = await mount();
    apiCall.mockClear();
    apiCall.mockResolvedValueOnce(failure("CHAT_DISABLED"));
    apiCall.mockResolvedValue(data("disabled_by_opponent"));
    expect(await act(() => hook.result.current.send("a", "c1"))).toEqual({ ok: false, kind: "refused", message: "Komunikat serwera." });
    await tick(0);
    expect(urls().filter((url) => url.startsWith("/api/games/g1/chat?") || url === "/api/games/g1/chat")).toHaveLength(2);
    expect(hook.result.current.state).toBe("disabled_by_opponent");
  });

  it("passes the refused text on as a field error, from the field errors or the message", async () => {
    const hook = await mount();
    apiCall.mockResolvedValueOnce(failure("VALIDATION", { fieldErrors: { text: ["Za długa."] } }));
    expect(await act(() => hook.result.current.send("a", "c1"))).toEqual({ ok: false, kind: "field", message: "Za długa." });
    apiCall.mockResolvedValueOnce(failure("VALIDATION"));
    expect(await act(() => hook.result.current.send("a", "c2"))).toEqual({ ok: false, kind: "field", message: "Komunikat serwera." });
  });

  it("tells the room the game is gone on a 404", async () => {
    const hook = await mount();
    apiCall.mockResolvedValueOnce(failure("NOT_FOUND"));
    await act(() => hook.result.current.send("a", "c1"));
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});

describe("useChat, turning the chat off and on", () => {
  const SETTINGS = "/api/games/g1/chat/settings";
  const changed = (state: string) => ({ ok: true, data: { state } });
  /** Answers the settings call and the reads by URL, so the order of the calls does not matter. */
  const route = (handlers: { settings?: unknown; read?: () => unknown; send?: unknown }) =>
    apiCall.mockImplementation(async (url: string, options: { method?: string }) => {
      if (url === SETTINGS) return handlers.settings;
      if (options.method === "GET") return handlers.read?.() ?? data("open");
      return handlers.send;
    });

  it("turns the chat off with a PUT, clears the conversation and shows the switch as busy meanwhile", async () => {
    apiCall.mockResolvedValue(data("open", [message(1), message(2, 1)]));
    const hook = await mount();
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    let outcome!: Promise<unknown>;
    await act(async () => void (outcome = hook.result.current.setEnabled(false)));
    expect(hook.result.current.switching).toBe(true);
    expect(apiCall).toHaveBeenLastCalledWith(SETTINGS, {
      method: "PUT",
      body: { enabled: false },
      signal: expect.any(AbortSignal),
    });

    await act(async () => finish(changed("disabled_by_you")));
    expect(await outcome).toEqual({ ok: true });
    expect(hook.result.current).toMatchObject({ switching: false, state: "disabled_by_you", messages: [] });
  });

  it("turns it on again and reads the latest page from scratch, so the earlier messages are back", async () => {
    apiCall.mockResolvedValue(data("open", [message(1), message(2, 1)]));
    const hook = await mount();
    apiCall.mockResolvedValueOnce(changed("disabled_by_you"));
    await act(() => hook.result.current.setEnabled(false));
    apiCall.mockClear();
    apiCall.mockResolvedValueOnce(changed("open")).mockResolvedValue(data("open", [message(1), message(2, 1)]));
    await act(() => hook.result.current.setEnabled(true));
    await tick(0);

    expect(urls()).toEqual([SETTINGS, "/api/games/g1/chat"]);
    expect(hook.result.current).toMatchObject({ state: "open" });
    expect(hook.result.current.messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it("keeps the conversation when turning on shows that the opponent has it off", async () => {
    apiCall.mockResolvedValue(data("disabled_by_opponent", [message(1)]));
    const hook = await mount();
    apiCall.mockResolvedValueOnce(changed("disabled_by_opponent"));
    await act(() => hook.result.current.setEnabled(true));
    expect(hook.result.current.state).toBe("disabled_by_opponent");
    expect(hook.result.current.messages.map((m) => m.id)).toEqual([1]);
  });

  it("changes once for a double click", async () => {
    const hook = await mount();
    let finish!: (value: unknown) => void;
    apiCall.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    apiCall.mockClear();
    let results!: unknown[];
    await act(async () => {
      const both = Promise.all([hook.result.current.setEnabled(false), hook.result.current.setEnabled(false)]);
      finish(changed("disabled_by_you"));
      results = await both;
    });
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ ok: true }, { ok: false, kind: "busy" }]);
  });

  it("changes nothing on a lost connection and lets the same call be repeated", async () => {
    const hook = await mount();
    apiCall.mockResolvedValueOnce(failure("network"));
    expect(await act(() => hook.result.current.setEnabled(false))).toEqual({ ok: false, kind: "failed" });
    expect(hook.result.current).toMatchObject({ state: "open", switching: false });
    apiCall.mockResolvedValueOnce(changed("disabled_by_you"));
    expect(await act(() => hook.result.current.setEnabled(false))).toEqual({ ok: true });
    expect(hook.result.current.state).toBe("disabled_by_you");
  });

  it("tells the room the game is gone on a 404", async () => {
    const hook = await mount();
    apiCall.mockResolvedValueOnce(failure("NOT_FOUND"));
    expect(await act(() => hook.result.current.setEnabled(false))).toEqual({ ok: false, kind: "failed" });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("reads the chat again when it turns out to be unavailable and says it was refused", async () => {
    const hook = await mount();
    apiCall.mockClear();
    apiCall.mockResolvedValueOnce(failure("CHAT_UNAVAILABLE")).mockResolvedValue(data("closed"));
    expect(await act(() => hook.result.current.setEnabled(false))).toEqual({ ok: false, kind: "refused" });
    await tick(0);
    expect(hook.result.current.state).toBe("closed");
    expect(urls()).toEqual([SETTINGS, "/api/games/g1/chat?after_id=0"]);
  });

  it("drops a read that began before the change and reads again, so it cannot bring the conversation back", async () => {
    const hook = await mount();
    let finishStale!: (value: unknown) => void;
    let reads = 0;
    route({
      settings: changed("disabled_by_you"),
      read: () => (++reads === 1 ? new Promise((resolve) => (finishStale = resolve)) : data("disabled_by_you")),
    });
    await tick(CHAT_POLL_INTERVAL_MS);
    expect(reads).toBe(1);

    await act(() => hook.result.current.setEnabled(false));
    await act(async () => finishStale(data("open", [message(9)])));
    await tick(0);

    expect(reads).toBe(2);
    expect(hook.result.current).toMatchObject({ state: "disabled_by_you", messages: [] });
  });

  it("ignores the result of a send that began before the change", async () => {
    const hook = await mount();
    let finishSend!: (value: unknown) => void;
    apiCall.mockImplementation(async (url: string, options: { method?: string }) => {
      if (url === SETTINGS) return changed("disabled_by_you");
      if (options.method === "GET") return data("disabled_by_you");
      return new Promise((resolve) => (finishSend = resolve));
    });
    let outcome!: Promise<unknown>;
    await act(async () => void (outcome = hook.result.current.send("hej", "c1")));
    await act(() => hook.result.current.setEnabled(false));
    await act(async () => finishSend({ ok: true, data: { message: message(7, 1), retryAfterMs: 2000 } }));

    expect(await outcome).toEqual({ ok: true });
    expect(hook.result.current).toMatchObject({ state: "disabled_by_you", messages: [] });
  });

  it("can be called before the first read without inventing a conversation", async () => {
    apiCall.mockImplementation(async (url: string) => (url === SETTINGS ? changed("disabled_by_you") : new Promise(() => {})));
    const hook = renderHook(() => useChat({ gameId: "g1", onGone }));
    await tick(0);
    expect(await act(() => hook.result.current.setEnabled(false))).toEqual({ ok: true });
    expect(hook.result.current.loaded).toBe(false);
  });
});
