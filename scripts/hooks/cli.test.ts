import { Readable } from "node:stream";

import { afterEach, expect, it, vi } from "vitest";

const { main } = vi.hoisted(() => ({ main: vi.fn() }));
vi.mock("./main.mjs", () => ({ main }));

afterEach(() => {
  process.exitCode = undefined;
});

it("runs the hook with real stdin, existsSync and console.error, and sets the exit code", async () => {
  main.mockResolvedValue(2);
  await import("./cli.mjs");

  expect(main).toHaveBeenCalledWith(expect.objectContaining({ error: console.error }));
  const { readStdin, fileExists } = main.mock.calls[0]![0] as { readStdin: () => Promise<string>; fileExists: (p: string) => boolean };
  expect(fileExists("package.json")).toBe(true);
  const stdin = Object.getOwnPropertyDescriptor(process, "stdin")!;
  Object.defineProperty(process, "stdin", { value: Readable.from(["{}"]), configurable: true });
  try {
    await expect(readStdin()).resolves.toBe("{}");
  } finally {
    Object.defineProperty(process, "stdin", stdin);
  }
  expect(process.exitCode).toBe(2);
});
