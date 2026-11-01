// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { crispLineWidth, watchDevicePixelRatio } from "./board-line-width";

afterEach(() => vi.unstubAllGlobals());

describe("crispLineWidth", () => {
  it.each([
    [1, "1px"],
    [2, "1px"],
    [0.75, "1px"],
    [Number.NaN, "1px"],
    [1.5, `${1 / 1.5}px`],
    [2.625, `${2 / 2.625}px`],
  ])("DPR %s gives %s", (ratio, expected) => {
    expect(crispLineWidth(ratio)).toBe(expected);
  });

  it("always covers a whole number of device pixels", () => {
    for (const ratio of [1, 1.25, 1.5, 2, 2.625, 3]) {
      const devicePixels = Number.parseFloat(crispLineWidth(ratio)) * ratio;
      expect(devicePixels).toBeCloseTo(Math.round(devicePixels), 9);
    }
  });
});

describe("watchDevicePixelRatio", () => {
  it("reports the current ratio, re-subscribes on change and stops on unsubscribe", () => {
    const queries: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; media: string }[] = [];
    vi.stubGlobal(
      "matchMedia",
      vi.fn((media: string) => {
        const query = { media, addEventListener: vi.fn(), removeEventListener: vi.fn() };
        queries.push(query);
        return query;
      }),
    );
    vi.stubGlobal("devicePixelRatio", 2);
    const seen: number[] = [];

    const stop = watchDevicePixelRatio((ratio) => seen.push(ratio));
    expect(seen).toEqual([2]);
    expect(queries[0]?.media).toBe("(resolution: 2dppx)");

    vi.stubGlobal("devicePixelRatio", 1.5);
    (queries[0]?.addEventListener.mock.calls[0]?.[1] as () => void)();
    expect(seen).toEqual([2, 1.5]);
    expect(queries[0]?.removeEventListener).toHaveBeenCalledTimes(1);
    expect(queries[1]?.media).toBe("(resolution: 1.5dppx)");

    stop();
    expect(queries[1]?.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("reads the ratio once when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const seen: number[] = [];
    const stop = watchDevicePixelRatio((ratio) => seen.push(ratio));
    stop();
    expect(seen).toHaveLength(1);
  });
});
