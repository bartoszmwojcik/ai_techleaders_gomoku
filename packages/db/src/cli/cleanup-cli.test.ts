import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, expect, it, vi } from "vitest";

const { loadEnvConfig, runCleanup } = vi.hoisted(() => ({ loadEnvConfig: vi.fn(), runCleanup: vi.fn() }));
vi.mock("@next/env", () => ({ default: { loadEnvConfig } }));
vi.mock("../cleanup/run-cleanup", () => ({ runCleanup }));

afterEach(() => {
  process.exitCode = undefined;
  vi.resetModules();
  runCleanup.mockReset();
  loadEnvConfig.mockReset();
});

it("loads the root .env files (forceReload) and sets the exit code from the run", async () => {
  runCleanup.mockResolvedValue(1);
  vi.stubEnv("ADMIN_EMAIL", "  Admin@Example.COM ");

  await import("./cleanup-cli");

  const [root, dev, , forceReload] = loadEnvConfig.mock.calls[0]!;
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("gomoku");
  expect(dev).toBe(true);
  expect(forceReload).toBe(true);
  expect(process.exitCode).toBe(1);
});

it("protects the normalized ADMIN_EMAIL from the sweep (E08-S01)", async () => {
  runCleanup.mockResolvedValue(0);
  vi.stubEnv("ADMIN_EMAIL", "  Admin@Example.COM ");

  await import("./cleanup-cli");

  expect(runCleanup).toHaveBeenCalledWith({ protectedEmail: "admin@example.com" });
});

it("protects nothing without ADMIN_EMAIL", async () => {
  runCleanup.mockResolvedValue(0);
  vi.stubEnv("ADMIN_EMAIL", "");

  await import("./cleanup-cli");

  expect(runCleanup).toHaveBeenCalledWith({ protectedEmail: undefined });
});
