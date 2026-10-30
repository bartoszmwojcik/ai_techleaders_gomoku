// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePageVisibility } from "./use-page-visibility";

function setVisibility(state: "hidden" | "visible") {
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

afterEach(() => {
  cleanup();
  setVisibility("visible");
});

describe("usePageVisibility", () => {
  it("reports the hidden state of the tab", () => {
    const { result } = renderHook(() => usePageVisibility({ onReturn: vi.fn() }));
    expect(result.current).toBe(false);
    setVisibility("hidden");
    expect(result.current).toBe(true);
    setVisibility("visible");
    expect(result.current).toBe(false);
  });

  it("calls back with a long absence above 30 s", () => {
    let time = 1_000;
    const onReturn = vi.fn();
    renderHook(() => usePageVisibility({ onReturn, now: () => time }));
    setVisibility("hidden");
    time += 45_000;
    setVisibility("visible");
    expect(onReturn).toHaveBeenCalledExactlyOnceWith({ awayMs: 45_000, longAbsence: true });
  });

  it("calls back with a short absence at 30 s or less", () => {
    let time = 0;
    const onReturn = vi.fn();
    renderHook(() => usePageVisibility({ onReturn, now: () => time }));
    setVisibility("hidden");
    time += 30_000;
    setVisibility("visible");
    expect(onReturn).toHaveBeenCalledExactlyOnceWith({ awayMs: 30_000, longAbsence: false });
  });

  it("keeps the first hiding when hidden is reported twice, and never goes negative", () => {
    let time = 10_000;
    const onReturn = vi.fn();
    renderHook(() => usePageVisibility({ onReturn, now: () => time }));
    setVisibility("hidden");
    time += 5_000;
    setVisibility("hidden");
    time -= 20_000;
    setVisibility("visible");
    expect(onReturn).toHaveBeenCalledExactlyOnceWith({ awayMs: 0, longAbsence: false });
  });

  it("ignores 'visible' without a prior 'hidden' and a second 'visible'", () => {
    const onReturn = vi.fn();
    renderHook(() => usePageVisibility({ onReturn }));
    setVisibility("visible");
    setVisibility("hidden");
    setVisibility("visible");
    setVisibility("visible");
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("uses the latest callback and the wall clock by default", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => usePageVisibility({ onReturn: cb }), { initialProps: { cb: first } });
    rerender({ cb: second });
    setVisibility("hidden");
    vi.advanceTimersByTime(40_000);
    setVisibility("visible");
    vi.useRealTimers();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith({ awayMs: 40_000, longAbsence: true });
  });

  it("stops listening on unmount", () => {
    const onReturn = vi.fn();
    const { unmount } = renderHook(() => usePageVisibility({ onReturn }));
    unmount();
    setVisibility("hidden");
    setVisibility("visible");
    expect(onReturn).not.toHaveBeenCalled();
  });
});
