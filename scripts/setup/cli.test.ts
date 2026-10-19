import { afterEach, expect, it, vi } from "vitest";

const { main } = vi.hoisted(() => ({ main: vi.fn() }));
vi.mock("./main.mjs", () => ({ main }));

afterEach(() => {
  process.exitCode = undefined;
  vi.unstubAllGlobals();
});

it("runs the installer with the command-line arguments and sets the exit code", async () => {
  main.mockResolvedValue(3);
  const argv = process.argv;
  process.argv = ["node", "scripts/setup/cli.mjs", "--with-browser"];
  try {
    await import("./cli.mjs");
  } finally {
    process.argv = argv;
  }

  expect(main).toHaveBeenCalledWith(["--with-browser"]);
  expect(process.exitCode).toBe(3);
});
