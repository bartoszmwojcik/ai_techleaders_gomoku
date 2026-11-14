import { afterEach, expect, it, vi } from "vitest";

const { main } = vi.hoisted(() => ({ main: vi.fn() }));
vi.mock("./main.mjs", () => ({ main }));

afterEach(() => {
  process.exitCode = undefined;
});

it("runs the helper with the command-line arguments and the real environment, and sets the exit code", async () => {
  main.mockReturnValue(1);
  const argv = process.argv;
  process.argv = ["node", "scripts/release/cli.mjs", "next", "patch"];
  try {
    await import("./cli.mjs");
  } finally {
    process.argv = argv;
  }

  expect(main).toHaveBeenCalledWith(["next", "patch"], { root: process.cwd(), log: console.log, error: console.error });
  expect(process.exitCode).toBe(1);
});
