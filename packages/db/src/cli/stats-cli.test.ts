import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, expect, it, vi } from "vitest";

const { loadEnvConfig, runStats } = vi.hoisted(() => ({ loadEnvConfig: vi.fn(), runStats: vi.fn() }));
vi.mock("@next/env", () => ({ default: { loadEnvConfig } }));
vi.mock("../stats/run-stats", () => ({ runStats }));

afterEach(() => {
  process.exitCode = undefined;
});

it("loads the root .env files (forceReload) and sets the exit code from the run", async () => {
  runStats.mockResolvedValue(1);

  await import("./stats-cli");

  const [root, dev, , forceReload] = loadEnvConfig.mock.calls[0]!;
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("gomoku");
  expect(dev).toBe(true);
  expect(forceReload).toBe(true);
  expect(process.exitCode).toBe(1);
});
