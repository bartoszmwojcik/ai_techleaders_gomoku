import { describe, expect, it, vi } from "vitest";

import { main } from "./main.mjs";

const run = (input: unknown, fileExists = () => true) => {
  const error = vi.fn();
  return main({ readStdin: async () => JSON.stringify(input), fileExists, error }).then((code) => ({ code, error }));
};

describe("main", () => {
  it("exits 2 and prints the reason for an existing migration", async () => {
    const { code, error } = await run({
      tool_name: "Edit",
      tool_input: { file_path: "/repo/packages/db/src/migrations/Migration1.ts", new_string: "x" },
      cwd: "/repo",
    });
    expect(code).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("existing migration"));
  });

  it("exits 0 silently for an ordinary file", async () => {
    const { code, error } = await run({ tool_name: "Edit", tool_input: { file_path: "/repo/a.ts", new_string: "x" }, cwd: "/repo" });
    expect(code).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it("passes fileExists through (new migration is allowed)", async () => {
    const { code } = await run(
      { tool_name: "Write", tool_input: { file_path: "/repo/packages/db/src/migrations/Migration2.ts", content: "x" }, cwd: "/repo" },
      () => false,
    );
    expect(code).toBe(0);
  });
});
