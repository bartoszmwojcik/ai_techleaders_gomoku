import { afterEach, expect, it, vi } from "vitest";

const { main } = vi.hoisted(() => ({ main: vi.fn() }));
vi.mock("./main.mjs", () => ({ main }));

import { readCodeFacts } from "./code-facts.mjs";
import { loadModel } from "./likec4-model.mjs";

afterEach(() => {
  process.exitCode = undefined;
});

it("runs the check with the command-line arguments and the real dependencies, and sets the exit code", async () => {
  main.mockResolvedValue(1);
  const argv = process.argv;
  process.argv = ["node", "scripts/architecture/cli.mjs", "check"];
  try {
    await import("./cli.mjs");
  } finally {
    process.argv = argv;
  }
  expect(main).toHaveBeenCalledWith(["check"], { root: process.cwd(), loadModel, readCodeFacts, log: console.log, error: console.error });
  expect(process.exitCode).toBe(1);
});
