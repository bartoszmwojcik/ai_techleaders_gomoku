import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it, vi } from "vitest";

const { loadEnvConfig, getDatabaseStatus } = vi.hoisted(() => ({ loadEnvConfig: vi.fn(), getDatabaseStatus: vi.fn() }));
vi.mock("@next/env", () => ({ default: { loadEnvConfig } }));
vi.mock("./status", () => ({ getDatabaseStatus }));

it("loads the development .env files and prints the status as one JSON line", async () => {
  getDatabaseStatus.mockResolvedValue({ ok: true, pending: 1 });
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  await import("./status-cli");

  const [root, dev] = loadEnvConfig.mock.calls[0]!;
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("gomoku");
  expect(dev).toBe(true);
  expect(write).toHaveBeenCalledWith('{"ok":true,"pending":1}\n');
  write.mockRestore();
});
