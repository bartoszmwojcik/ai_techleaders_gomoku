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

const sha = (...parts: (string | number)[]) => {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(String(part));
  return hash.digest("hex");
};
/** Hash entry of one file in the format of the `skills` CLI (lock version 2): path, NUL, length, NUL, content. */
const entry = (path: string, content: string) => [path, "\0", Buffer.byteLength(content), "\0", content];
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
    JSON.stringify({ version: 2, skills: Object.fromEntries(Object.entries(skills).map(([n, h]) => [n, { computedHash: h }])) }),
  );

describe("computeSkillHash", () => {
  it("hashes path, length and content of every file in bytewise path order (SKILL.md before references), skipping excluded entries", () => {
    skill("a", {
      "SKILL.md": "x",
      "references/b.md": "y",
      "metadata.json": "{}",
      ".git/HEAD": "z",
      "__pycache__/m.pyc": "q",
      "__pypackages__/p.py": "r",
    });
    expect(computeSkillHash(join(root, ".agents", "skills", "a"))).toBe(sha(...entry("SKILL.md", "x"), ...entry("references/b.md", "y")));
  });

  it("normalizes CRLF in text files but leaves binary files untouched", () => {
    skill("a", { "SKILL.md": "x\r\ny", "bin.dat": "a\0\r\nb" });
    expect(computeSkillHash(join(root, ".agents", "skills", "a"))).toBe(sha(...entry("SKILL.md", "x\ny"), ...entry("bin.dat", "a\0\r\nb")));
  });
});

describe("verifySkillsLock", () => {
  it("reports nothing when every hash matches", () => {
    skill("a", { "SKILL.md": "x" });
    lock({ a: sha(...entry("SKILL.md", "x")) });
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
