import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, expect, it, vi } from "vitest";

const { loadEnvConfig, runAdminCreate, createPrompter } = vi.hoisted(() => ({
  loadEnvConfig: vi.fn(),
  runAdminCreate: vi.fn(),
  createPrompter: vi.fn(() => ({ interactive: false })),
}));
vi.mock("@next/env", () => ({ default: { loadEnvConfig } }));
vi.mock("./admin-create", () => ({ runAdminCreate }));
vi.mock("./terminal-input", () => ({ createPrompter }));

afterEach(() => {
  process.exitCode = undefined;
});

it("loads the root .env files (forceReload) and runs the command with the process streams", async () => {
  runAdminCreate.mockResolvedValue(1);

  await import("./admin-create-cli");

  const [root, dev, , forceReload] = loadEnvConfig.mock.calls[0]!;
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("gomoku");
  expect(dev).toBe(true);
  expect(forceReload).toBe(true);
  expect(createPrompter).toHaveBeenCalledWith(process.stdin, process.stderr);
  expect(runAdminCreate).toHaveBeenCalledWith(expect.objectContaining({ env: process.env, argv: process.argv.slice(2) }));
  expect(process.exitCode).toBe(1);
});
