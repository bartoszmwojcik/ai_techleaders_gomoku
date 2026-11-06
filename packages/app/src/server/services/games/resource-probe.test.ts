import { describe, expect, it, vi } from "vitest";

import { createResourceProbe } from "./resource-probe";

const MB = 1024 * 1024;

describe("createResourceProbe (hosted-bot R10)", () => {
  it("uses the fixed value first and reads nothing", () => {
    const availableMemory = vi.fn(() => 4096 * MB);
    const freemem = vi.fn(() => 4096 * MB);
    expect(createResourceProbe({ fixedMb: 768, availableMemory, freemem }).read()).toEqual({ availableMb: 768, source: "fixed" });
    expect(createResourceProbe({ fixedMb: 1_000_000 }).read()).toEqual({ availableMb: 32_767, source: "fixed" });
    expect(availableMemory).not.toHaveBeenCalled();
    expect(freemem).not.toHaveBeenCalled();
  });

  it("prefers the cgroup-aware process reading, in whole megabytes", () => {
    const probe = createResourceProbe({ availableMemory: () => 1892.7 * MB, freemem: () => 9000 * MB });
    expect(probe.read()).toEqual({ availableMb: 1892, source: "process" });
  });

  it("falls back to the OS without a usable process reading", () => {
    expect(createResourceProbe({ availableMemory: () => 0, freemem: () => 512 * MB }).read()).toEqual({
      availableMb: 512,
      source: "os",
    });
  });

  it("reads the real process and OS by default", () => {
    const process = vi.spyOn(globalThis.process, "availableMemory").mockReturnValue(1000 * MB);
    expect(createResourceProbe().read()).toEqual({ availableMb: 1000, source: "process" });
    process.mockReturnValue(0);
    expect(createResourceProbe().read().source).toBe("os");
    process.mockRestore();
  });

  it("does without process.availableMemory on an older runtime", () => {
    const original = globalThis.process.availableMemory;
    // @ts-expect-error -- simulating a runtime without the function
    delete globalThis.process.availableMemory;
    try {
      expect(createResourceProbe().read().source).toBe("os");
    } finally {
      globalThis.process.availableMemory = original;
    }
  });
});
