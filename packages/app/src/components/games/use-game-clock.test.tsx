// @vitest-environment jsdom
import type { ClockView } from "@gomoku/core/games/clock";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGameClock } from "./use-game-clock";

const view = (over: Partial<ClockView> = {}): ClockView => ({
  remainingMs: [600_000, 600_000],
  running: 1,
  now: 1_000_000,
  ...over,
});
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useGameClock", () => {
  it("shows the server's values as they came on the first render", () => {
    const clock = view({ remainingMs: [90_000, 600_000] });
    const hook = renderHook(() => useGameClock(clock));
    // renderHook has already run the effects: live, nothing elapsed yet.
    expect(hook.result.current.remainingMs).toEqual([90_000, 600_000]);
    expect(hook.result.current.live).toBe(true);
  });

  it("is not live on the server render", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const CLOCK = view();
    let live: boolean | undefined;
    function Probe() {
      live = useGameClock(CLOCK).live;
      return null;
    }
    renderToStaticMarkup(<Probe />);
    expect(live).toBe(false);
  });

  it("counts down only the clock that runs, second by second", async () => {
    const clock = view({ running: 2 });
    const hook = renderHook(() => useGameClock(clock));
    await tick(3_000);
    expect(hook.result.current.remainingMs).toEqual([600_000, 597_000]);
    await tick(1_500);
    // Between two full seconds nothing changes: the digits would not either.
    expect(hook.result.current.remainingMs[1]).toBe(596_000);
    expect(hook.result.current.remainingMs[0]).toBe(600_000);
  });

  it("does not run before the clock started or after the game", async () => {
    const idle = view({ running: null });
    const running = view();
    const stopped = renderHook(() => useGameClock(idle));
    const finished = renderHook(() => useGameClock(running, { finished: true }));
    await tick(5_000);
    expect(stopped.result.current.remainingMs).toEqual([600_000, 600_000]);
    expect(finished.result.current.remainingMs).toEqual([600_000, 600_000]);
  });

  it("follows the server's time: the offset is measured again with every answer", async () => {
    const first = view({ remainingMs: [100_000, 600_000], now: 1_000_000 });
    const hook = renderHook(({ clock }) => useGameClock(clock), { initialProps: { clock: first } });
    await tick(4_000);
    expect(hook.result.current.remainingMs[0]).toBe(96_000);
    // The server says 90 s although the local count says 96 s: the server wins, then the count goes on.
    hook.rerender({ clock: view({ remainingMs: [90_000, 600_000], now: 1_010_000 }) });
    expect(hook.result.current.remainingMs[0]).toBe(90_000);
    await tick(2_000);
    expect(hook.result.current.remainingMs[0]).toBe(88_000);
  });

  it("does not depend on the wall clock of the browser", async () => {
    const clock = view({ remainingMs: [50_000, 600_000] });
    const hook = renderHook(() => useGameClock(clock));
    vi.setSystemTime(new Date("2001-01-01T00:00:00Z"));
    await tick(2_000);
    expect(hook.result.current.remainingMs[0]).toBe(48_000);
  });

  it("stops at zero, never below, and asks for the state once", async () => {
    const onExpire = vi.fn();
    const clock = view({ remainingMs: [2_500, 600_000] });
    const hook = renderHook(() => useGameClock(clock, { onExpire }));
    await tick(2_000);
    expect(hook.result.current.remainingMs[0]).toBe(1_000);
    expect(onExpire).not.toHaveBeenCalled();
    await tick(10_000);
    expect(hook.result.current.remainingMs[0]).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("asks again for the next answer that is still running and reaches zero", async () => {
    const onExpire = vi.fn();
    const hook = renderHook(({ clock }) => useGameClock(clock, { onExpire }), {
      initialProps: { clock: view({ remainingMs: [1_000, 600_000] }) },
    });
    await tick(2_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    // The server was a few ms short of the deadline: a new answer, a new countdown, a new request.
    hook.rerender({ clock: view({ remainingMs: [30, 600_000], now: 1_002_000 }) });
    await tick(1_000);
    expect(onExpire).toHaveBeenCalledTimes(2);
  });

  it("works without a callback and uses the newest one", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const clock = view({ remainingMs: [1_000, 600_000] });
    const hook = renderHook(({ cb }) => useGameClock(clock, { onExpire: cb }), {
      initialProps: { cb: first as (() => void) | undefined },
    });
    hook.rerender({ cb: second });
    await tick(2_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    const other = view({ remainingMs: [1_000, 600_000] });
    const none = renderHook(() => useGameClock(other));
    await tick(2_000);
    expect(none.result.current.remainingMs[0]).toBe(0);
  });

  it("clears its timer and its subscription on unmount", async () => {
    const clock = view();
    const hook = renderHook(() => useGameClock(clock));
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
