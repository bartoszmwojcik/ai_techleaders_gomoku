// Writes the release version into every tracked manifest: the root package.json, each workspace package.json and
// the matching entries of package-lock.json (npm keeps the workspace versions there too).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

/** Workspace directories (relative to `root`) from the `workspaces` globs; `dir/*` and plain `dir` are supported. */
export function workspaceDirs(root) {
  const dirs = [];
  for (const pattern of readJson(join(root, "package.json")).workspaces) {
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2);
      const entries = readdirSync(join(root, base), { withFileTypes: true });
      dirs.push(...entries.filter((entry) => entry.isDirectory()).map((entry) => `${base}/${entry.name}`));
    } else {
      dirs.push(pattern);
    }
  }
  return dirs;
}

/** Sets `version` everywhere it is recorded; returns the files that changed (none when already at `version`). */
export function bumpVersion(root, version) {
  const dirs = workspaceDirs(root);
  const changed = [];
  for (const dir of [".", ...dirs]) {
    const path = join(root, dir, "package.json");
    const manifest = readJson(path);
    if (manifest.version === version) continue;
    writeJson(path, { ...manifest, version });
    changed.push(join(dir, "package.json"));
  }
  const lockPath = join(root, "package-lock.json");
  const lock = readJson(lockPath);
  let lockChanged = false;
  for (const key of ["", ...dirs]) {
    const entry = lock.packages[key];
    if (!entry) throw new Error(`package-lock.json has no entry for "${key}" — run npm install first`);
    if (entry.version === version) continue;
    entry.version = version;
    lockChanged = true;
  }
  if (lockChanged) {
    writeJson(lockPath, lock);
    changed.push("package-lock.json");
  }
  return changed;
}
