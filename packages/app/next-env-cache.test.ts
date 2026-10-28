import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Uses the real @next/env (next.config.test.ts mocks it): the mock hid that a second
// `loadEnvConfig` call for another directory is served from the cache `next dev` filled
// for the app directory, so the monorepo root env files were never read in development.
let appDir: string;
let rootDir: string;

beforeEach(() => {
  vi.resetModules();
  appDir = mkdtempSync(join(tmpdir(), "env-app-"));
  rootDir = mkdtempSync(join(tmpdir(), "env-root-"));
  writeFileSync(join(rootDir, ".env"), "GOMOKU_ENV_CACHE_PROBE=from-root\n");
});

afterEach(() => {
  delete process.env.GOMOKU_ENV_CACHE_PROBE;
  rmSync(appDir, { recursive: true, force: true });
  rmSync(rootDir, { recursive: true, force: true });
});

describe("@next/env cache", () => {
  it("ignores a second directory unless the reload is forced", async () => {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(appDir, true);
    loadEnvConfig(rootDir, true);

    expect(process.env.GOMOKU_ENV_CACHE_PROBE).toBeUndefined();
  });

  it("reads the root env file when the reload is forced, as next.config.ts does", async () => {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(appDir, true);
    loadEnvConfig(rootDir, true, console, true);

    expect(process.env.GOMOKU_ENV_CACHE_PROBE).toBe("from-root");
  });
});
