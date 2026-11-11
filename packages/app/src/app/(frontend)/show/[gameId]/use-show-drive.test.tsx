// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useShowDrive, type DriveRead } from "./use-show-drive";

type Props = Parameters<typeof useShowDrive>[0];

let visibility: DocumentVisibilityState = "visible";
const setVisibility = (state: DocumentVisibilityState) =>
  act(() => {
    visibility = state;
    document.dispatchEvent(new Event("visibilitychange"));
  });

const OK: DriveRead = { ok: true, botOnTurn: false, open: true };
const FAILED: DriveRead = { ok: false, gone: false };

let clock = 0;
const now = () => clock;
const advance = (ms: number) =>
  act(async () => {
    clock += ms;
    await vi.advanceTimersByTimeAsync(ms);
  });

/** A signal the test aborts itself (the real `AbortSignal.timeout` is beyond fake timers, lesson 2026-10-31). */
let timeouts: AbortController[] = [];
const timeoutSignal = vi.fn((ms: number) => {
  void ms;
  const controller = new AbortController();
  timeouts.push(controller);
  return controller.signal;
});

function drive(over: Partial<Props> = {}) {
  const read = vi.fn<(signal: AbortSignal) => Promise<DriveRead>>(async () => OK);
  const props: Props = { open: true, botOnTurn: false, serverStalled: false, read, now, timeoutSignal, wakeLock: () => undefined, ...over };
  const hook = renderHook((p: Props) => useShowDrive(p), { initialProps: props });
  return { ...hook, read: (over.read as typeof read | undefined) ?? read, props };
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
  timeouts = [];
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useShowDrive: the pace (show-mode P8)", () => {
  it("reads every 2 s, every 750 ms while a bot is on turn, each read planned after the previous answer", async () => {
    let answer!: (value: DriveRead) => void;
    const read = vi.fn(() => new Promise<DriveRead>((resolve) => (answer = resolve)));
    const { result } = drive({ read, botOnTurn: true });

    await advance(749);
    expect(read).not.toHaveBeenCalled();
    await advance(1);
    expect(read).toHaveBeenCalledOnce();
    expect(result.current.checking).toBe(true);
    // The answer takes 3 s: no second read meanwhile.
    await advance(3_000);
    expect(read).toHaveBeenCalledOnce();
    await act(async () => answer({ ok: true, botOnTurn: false, open: true }));
    expect(result.current.checking).toBe(false);
    // No bot on turn any more: 2 s to the next read.
    await advance(1_999);
    expect(read).toHaveBeenCalledOnce();
    await advance(1);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("ends a read that takes too long with its own signal, and counts it as a failure", async () => {
    const read = vi.fn(
      (signal: AbortSignal) => new Promise<DriveRead>((resolve) => signal.addEventListener("abort", () => resolve(FAILED))),
    );
    const { result } = drive({ read });
    await advance(2_000);
    expect(timeoutSignal).toHaveBeenCalledWith(8_000);

    await act(async () => timeouts[0]!.abort());

    expect(read.mock.calls[0]![0].aborted).toBe(true);
    expect(result.current.status).toEqual({ state: "slowed", failures: 1 });
  });

  it("reads once at a time: a check during a read makes one more read right after it", async () => {
    let answer!: (value: DriveRead) => void;
    const read = vi.fn(() => new Promise<DriveRead>((resolve) => (answer = resolve)));
    const { result } = drive({ read });

    act(() => {
      result.current.check();
      result.current.check();
    });
    expect(read).toHaveBeenCalledOnce();
    await act(async () => answer(OK));
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => answer(OK));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("stops after the show is over or gone, and never reads a closed show", async () => {
    const over = drive({ read: vi.fn(async () => ({ ok: true, botOnTurn: false, open: false }) as DriveRead) });
    await advance(2_000);
    await advance(10_000);
    expect(over.read).toHaveBeenCalledOnce();
    cleanup();

    const gone = drive({ read: vi.fn(async () => ({ ok: false, gone: true }) as DriveRead) });
    await advance(12_000);
    expect(gone.read).toHaveBeenCalledOnce();
    cleanup();

    const closed = drive({ open: false });
    act(() => closed.result.current.check());
    await advance(10_000);
    expect(closed.read).not.toHaveBeenCalled();
    expect(closed.result.current.status).toEqual({ state: "off" });
  });

  it("calls off the read in flight when the view goes away, and plans nothing after its answer", async () => {
    let answer!: (value: DriveRead) => void;
    const read = vi.fn((signal: AbortSignal) => new Promise<DriveRead>((resolve) => (answer = resolve, void signal)));
    const { unmount } = drive({ read });
    await advance(2_000);

    unmount();

    expect(read.mock.calls[0]![0].aborted).toBe(true);
    await act(async () => answer(OK));
    await advance(10_000);
    expect(read).toHaveBeenCalledOnce();
  });
});

describe("useShowDrive: the indicator (three sources, P8)", () => {
  it("runs, slows after a failure, stops after 3 failures in a row and runs again after a success", async () => {
    const answers = [FAILED, FAILED, FAILED, OK];
    const read = vi.fn(async () => answers.shift()!);
    const { result } = drive({ read });
    expect(result.current.status).toEqual({ state: "running" });

    await advance(2_000);
    expect(result.current.status).toEqual({ state: "slowed", failures: 1 });
    await advance(2_000);
    expect(result.current.status).toEqual({ state: "slowed", failures: 2 });
    await advance(2_000);
    expect(result.current.status).toMatchObject({ state: "stalled", reason: "silent" });
    await advance(2_000);
    expect(result.current.status).toEqual({ state: "running" });
  });

  it("stops when no read succeeded for more than 5 s, also while one is still waiting for its answer", async () => {
    const read = vi.fn(() => new Promise<DriveRead>(() => undefined));
    const { result } = drive({ read });

    await advance(5_000);
    expect(result.current.status).toEqual({ state: "running" });
    await advance(1_000);
    expect(result.current.status).toEqual({ state: "stalled", reason: "silent", silentMs: 6_000 });
  });

  it("says the bot does not answer when the server says so", () => {
    const { result } = drive({ serverStalled: true });
    expect(result.current.status).toEqual({ state: "stalled", reason: "bot", silentMs: 0 });
  });

  it("keeps reading in a hidden tab and says so, and reads at once when the tab is back", async () => {
    const { result, read } = drive();

    setVisibility("hidden");
    expect(result.current.status).toMatchObject({ state: "stalled", reason: "hidden" });
    await advance(4_000);
    expect(read).toHaveBeenCalledTimes(2);

    await advance(1_000);
    setVisibility("visible");
    await act(async () => undefined);
    expect(read).toHaveBeenCalledTimes(3);
    expect(result.current.status).toEqual({ state: "running" });
    // The timer starts again from that read.
    await advance(1_999);
    expect(read).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(read).toHaveBeenCalledTimes(4);
  });
});

describe("useShowDrive: keeping the screen on (P19, best effort)", () => {
  function lock(request: () => Promise<{ release(): Promise<void> }>) {
    return { request: vi.fn(request) };
  }

  it("asks for the screen lock while the show is open, again when the tab is back, and lets it go at the end", async () => {
    const release = vi.fn(async () => undefined);
    const wake = lock(async () => ({ release }));
    const { rerender, props } = drive({ wakeLock: () => wake });
    await act(async () => undefined);
    expect(wake.request).toHaveBeenCalledExactlyOnceWith("screen");

    setVisibility("hidden");
    await act(async () => undefined);
    expect(wake.request).toHaveBeenCalledOnce();
    setVisibility("visible");
    await act(async () => undefined);
    expect(wake.request).toHaveBeenCalledTimes(2);

    rerender({ ...props, open: false });
    expect(release).toHaveBeenCalledOnce();
  });

  it("lets a lock go that came after the end, and survives a refusal, a failed release and a browser without the API", async () => {
    let grant!: (sentinel: { release(): Promise<void> }) => void;
    const late = lock(() => new Promise((resolve) => (grant = resolve)));
    const first = drive({ wakeLock: () => late });
    first.unmount();
    const release = vi.fn(async () => Promise.reject(new Error("already released")));
    await act(async () => grant({ release }));
    expect(release).toHaveBeenCalledOnce();

    const refused = lock(async () => Promise.reject(new Error("NotAllowedError")));
    const second = drive({ wakeLock: () => refused });
    await act(async () => undefined);
    expect(refused.request).toHaveBeenCalledOnce();
    second.unmount();

    const failing = lock(async () => ({ release }));
    const third = drive({ wakeLock: () => failing });
    await act(async () => undefined);
    third.unmount();
    expect(release).toHaveBeenCalledTimes(2);

    const none = drive();
    expect(none.result.current.status).toEqual({ state: "running" });
  });

  it("uses the browser's own clock, timeout and wake lock by default", async () => {
    const request = vi.fn(async () => ({ release: async () => undefined }));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const read = vi.fn(async () => OK);
    renderHook(() => useShowDrive({ open: true, botOnTurn: false, serverStalled: false, read }));
    await act(async () => undefined);
    expect(request).toHaveBeenCalledWith("screen");

    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)));
    expect(read).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(8_000);
    Reflect.deleteProperty(navigator, "wakeLock");
  });
});
