import { Readable } from "node:stream";

import { afterEach, expect, it, vi } from "vitest";

const { main } = vi.hoisted(() => ({ main: vi.fn() }));
vi.mock("./main.mjs", () => ({ main }));

afterEach(() => {
  process.exitCode = undefined;
});

it("runs the helper with the command-line arguments and the real environment, and sets the exit code", async () => {
  main.mockResolvedValue(1);
  const argv = process.argv;
  process.argv = ["node", "scripts/ci/cli.mjs", "skills-lock"];
  try {
    await import("./cli.mjs");
  } finally {
    process.argv = argv;
  }

  expect(main).toHaveBeenCalledWith(["skills-lock"], expect.objectContaining({ root: process.cwd(), log: console.log }));
  const { readStdin } = main.mock.calls[0]![1] as { readStdin: () => Promise<string> };
  const stdin = Object.getOwnPropertyDescriptor(process, "stdin")!;
  Object.defineProperty(process, "stdin", { value: Readable.from(["docs/a.md\n"]), configurable: true });
  try {
    await expect(readStdin()).resolves.toBe("docs/a.md\n");
  } finally {
    Object.defineProperty(process, "stdin", stdin);
  }
  expect(process.exitCode).toBe(1);
});
