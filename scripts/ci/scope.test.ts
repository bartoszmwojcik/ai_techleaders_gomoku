import { describe, expect, it } from "vitest";

import { classify, isDocsOnly } from "./scope.mjs";

describe("isDocsOnly", () => {
  it.each(["docs/a.md", "README.md", ".ai/specs/a.md", ".ai/lessons/x.md", "LICENSE", "packages/app/NOTES.md", "AGENTS.md", ".ai/specs/product-brief.md"])(
    "%s is documentation",
    (file) => expect(isDocsOnly(file)).toBe(true),
  );

  it.each([
    ".agents/skills/x/SKILL.md",
    ".claude/skills/y/references/z.md",
    ".claude/settings.json",
    ".github/workflows/ci.yml",
    ".github/dependabot.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    "skills-lock.json",
    ".ai/skills/om-code-review/SKILL.md",
    ".ai/scripts/run.sh",
    ".ai/agentic.config.json",
    ".ai/trackers/github.md",
    ".ai/browsers/agent-browser.md",
    "packages/app/src/page.tsx",
    "package.json",
  ])("%s is code", (file) => expect(isDocsOnly(file)).toBe(false));
});

describe("classify", () => {
  it("is not code for documentation only, ignoring empty lines", () => {
    expect(classify(["docs/a.md", "", "README.md"])).toEqual({ code: false, arch: false, codeFiles: [] });
    expect(classify([""])).toEqual({ code: false, arch: false, codeFiles: [] });
  });

  it("is code, and lists the files, when anything else changed", () => {
    expect(classify(["docs/a.md", ".agents/skills/x/SKILL.md", "src/a.ts"])).toEqual({
      code: true,
      arch: false,
      codeFiles: [".agents/skills/x/SKILL.md", "src/a.ts"],
    });
  });
});

describe("classify: architecture model (arch)", () => {
  it.each(["docs/architektura/model.c4", "docs/architektura/package-lock.json", "docs/architektura/package.json"])(
    "%s runs the architecture check but stays documentation",
    (file) => expect(classify([file, "docs/a.md"])).toEqual({ code: false, arch: true, codeFiles: [] }),
  );

  it("scripts/architecture is code and runs the architecture check", () => {
    expect(classify(["scripts/architecture/compliance.mjs"])).toEqual({ code: true, arch: true, codeFiles: ["scripts/architecture/compliance.mjs"] });
  });

  it("other documentation, and code elsewhere, do not run it by themselves", () => {
    expect(classify(["docs/architektura.md", "docs/a.md"]).arch).toBe(false);
    expect(classify(["packages/app/src/server/container.ts"])).toEqual({ code: true, arch: false, codeFiles: ["packages/app/src/server/container.ts"] });
  });
});
