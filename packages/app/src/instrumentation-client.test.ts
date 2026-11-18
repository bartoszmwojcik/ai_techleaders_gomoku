import { describe, expect, it, vi } from "vitest";
import { globalConfig } from "zod/v4/core";

describe("instrumentation-client", () => {
  it("switches zod to jitless mode so the CSP (no 'unsafe-eval') is not probed with new Function", async () => {
    vi.resetModules();
    const previous = globalConfig.jitless;
    globalConfig.jitless = undefined;
    try {
      await import("./instrumentation-client");
      expect(globalConfig.jitless).toBe(true);
    } finally {
      globalConfig.jitless = previous;
    }
  });
});
