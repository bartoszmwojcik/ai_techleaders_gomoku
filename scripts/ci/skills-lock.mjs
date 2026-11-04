// Verifies skills-lock.json against the installed skills in .agents/skills (T-10). The hash is the one the
// `skills` CLI writes as `computedHash`: SHA-256 over, for every file of the skill folder sorted by relative
// path (`localeCompare`), the relative path followed by the file content; `.git` and `node_modules` are skipped.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

function collect(base, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== ".git" && entry.name !== "node_modules") collect(base, path, out);
    } else {
      out.push({ path: relative(base, path).split("\\").join("/"), content: readFileSync(path) });
    }
  }
}

export function computeSkillHash(skillDir) {
  const files = [];
  collect(skillDir, skillDir, files);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
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
