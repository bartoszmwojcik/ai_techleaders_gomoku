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
    expect(classify(["docs/a.md", "", "README.md"])).toEqual({ code: false, codeFiles: [] });
    expect(classify([""])).toEqual({ code: false, codeFiles: [] });
  });

  it("is code, and lists the files, when anything else changed", () => {
    expect(classify(["docs/a.md", ".agents/skills/x/SKILL.md", "src/a.ts"])).toEqual({
      code: true,
      codeFiles: [".agents/skills/x/SKILL.md", "src/a.ts"],
    });
  });
});
