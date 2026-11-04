import { afterEach, describe, expect, it, vi } from "vitest";

const { verifySkillsLock } = vi.hoisted(() => ({ verifySkillsLock: vi.fn() }));
vi.mock("./skills-lock.mjs", () => ({ verifySkillsLock }));

import { main } from "./main.mjs";

afterEach(() => vi.restoreAllMocks());

const run = (argv: string[], stdin = "") => {
  const log = vi.fn();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  return main(argv, { readStdin: async () => stdin, root: "/repo", log }).then((code) => ({ code, log, error }));
};

describe("scope", () => {
  it("prints code=false for documentation only", async () => {
    const { code, log, error } = await run(["scope"], "docs/a.md\nREADME.md\n");
    expect(code).toBe(0);
    expect(log.mock.calls).toEqual([["code=false"]]);
    expect(error).not.toHaveBeenCalled();
  });

  it("prints code=true and names the code files", async () => {
    const { code, log, error } = await run(["scope"], "docs/a.md\n.agents/skills/x/SKILL.md\n");
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith("code=true");
    expect(error).toHaveBeenCalledWith("code: .agents/skills/x/SKILL.md");
  });
});

describe("skills-lock", () => {
  it("exits 0 when the lock matches", async () => {
    verifySkillsLock.mockReturnValue([]);
    const { code, log } = await run(["skills-lock"]);
    expect(code).toBe(0);
    expect(verifySkillsLock).toHaveBeenCalledWith("/repo");
    expect(log).toHaveBeenCalledWith("skills-lock.json matches .agents/skills");
  });

  it("exits 1 and prints every problem", async () => {
    verifySkillsLock.mockReturnValue(["a: hash differs from skills-lock.json"]);
    const { code, log } = await run(["skills-lock"]);
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith("a: hash differs from skills-lock.json");
  });
});

it("prints usage and exits 2 for an unknown command", async () => {
  const { code, error } = await run(["nope"]);
  expect(code).toBe(2);
  expect(error).toHaveBeenCalledWith("Usage: cli.mjs scope|skills-lock");
});
