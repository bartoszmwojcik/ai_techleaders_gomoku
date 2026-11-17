// Verifies skills-lock.json against the installed skills in .agents/skills (T-10). The hash is the one the
// `skills` CLI (lock version 2) writes as `computedHash`: SHA-256 over, for every file of the skill folder sorted
// bytewise by relative path, the path, a NUL, the content length, a NUL and the content (CRLF normalized to LF for
// text files). `metadata.json` files and the `.git`, `__pycache__` and `__pypackages__` folders are skipped.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const EXCLUDED_FILES = new Set(["metadata.json"]);
const EXCLUDED_DIRS = new Set([".git", "__pycache__", "__pypackages__"]);

function collect(base, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) collect(base, path, out);
    } else if (!EXCLUDED_FILES.has(entry.name)) {
      out.push({ path: Buffer.from(relative(base, path).split("\\").join("/")), content: normalizeLineEndings(readFileSync(path)) });
    }
  }
}

function normalizeLineEndings(content) {
  if (content.includes(0) || !content.includes("\r\n")) return content;
  return Buffer.from(content.toString("latin1").replaceAll("\r\n", "\n"), "latin1");
}

export function computeSkillHash(skillDir) {
  const files = [];
  collect(skillDir, skillDir, files);
  files.sort((a, b) => Buffer.compare(a.path, b.path));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(String(file.content.length));
    hash.update("\0");
    hash.update(file.content);
  }
  return hash.digest("hex");
}

/** Problems found: a hash that differs, a locked skill that is missing, an installed skill that is not locked. */
export function verifySkillsLock(root) {
  const lock = JSON.parse(readFileSync(join(root, "skills-lock.json"), "utf8"));
  const skillsDir = join(root, ".agents", "skills");
  const installed = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const problems = [];
  for (const [name, entry] of Object.entries(lock.skills)) {
    if (!installed.includes(name)) problems.push(`${name}: locked but not installed`);
    else if (computeSkillHash(join(skillsDir, name)) !== entry.computedHash) problems.push(`${name}: hash differs from skills-lock.json`);
  }
  for (const name of installed) {
    if (!(name in lock.skills)) problems.push(`${name}: installed but not in skills-lock.json`);
  }
  return problems;
}
