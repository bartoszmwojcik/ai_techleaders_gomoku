import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeSkillHash, verifySkillsLock } from "./skills-lock.mjs";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "skills-lock-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const sha = (...parts: string[]) => {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
};
function skill(name: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, ".agents", "skills", name, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
}
const lock = (skills: Record<string, string>) =>
  writeFileSync(
    join(root, "skills-lock.json"),
    JSON.stringify({ version: 1, skills: Object.fromEntries(Object.entries(skills).map(([n, h]) => [n, { computedHash: h }])) }),
  );

describe("computeSkillHash", () => {
  it("hashes relative path and content of every file in locale path order (references before SKILL.md), skipping .git and node_modules", () => {
    skill("a", { "SKILL.md": "x", "references/b.md": "y", ".git/HEAD": "z", "node_modules/m/i.js": "q" });
    expect(computeSkillHash(join(root, ".agents", "skills", "a"))).toBe(sha("references/b.md", "y", "SKILL.md", "x"));
  });
});

describe("verifySkillsLock", () => {
  it("reports nothing when every hash matches", () => {
    skill("a", { "SKILL.md": "x" });
    lock({ a: sha("SKILL.md", "x") });
    expect(verifySkillsLock(root)).toEqual([]);
  });

  it("reports a changed skill, a missing one and an unlocked one", () => {
    skill("changed", { "SKILL.md": "x" });
    skill("extra", { "SKILL.md": "x" });
    writeFileSync(join(root, ".agents", "skills", "note.txt"), "not a skill");
    lock({ changed: sha("other"), gone: "0" });
    expect(verifySkillsLock(root)).toEqual([
      "changed: hash differs from skills-lock.json",
      "gone: locked but not installed",
      "extra: installed but not in skills-lock.json",
    ]);
  });

  it("matches the lock committed in this repository", () => {
    expect(verifySkillsLock(resolve(import.meta.dirname, "../.."))).toEqual([]);
  });
});
