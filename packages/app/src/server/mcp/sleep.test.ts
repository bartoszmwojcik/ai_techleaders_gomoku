import { afterEach, describe, expect, it, vi } from "vitest";

import { sleep } from "./sleep";

afterEach(() => vi.useRealTimers());

describe("sleep", () => {
  it("resolves after the time", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const pending = sleep(1000).then(done);

    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(done).toHaveBeenCalledOnce();
  });

  it("ends early when the request is cancelled, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = sleep(60_000, controller.signal);

    controller.abort();
    await pending;

    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait at all for a signal that is already aborted", async () => {
    vi.useFakeTimers();

    await sleep(60_000, AbortSignal.abort());

    expect(vi.getTimerCount()).toBe(0);
  });
});
