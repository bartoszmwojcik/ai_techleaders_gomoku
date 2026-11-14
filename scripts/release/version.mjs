// Version rules of the release workflow: plain `X.Y.Z` (no pre-release suffixes), bump or custom number.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parses `X.Y.Z`; anything else (a `v` prefix, a suffix, missing parts) is rejected. */
export function parseVersion(text) {
  const match = SEMVER.exec(text ?? "");
  if (!match) throw new Error(`Invalid version "${text}": expected X.Y.Z (for example 1.4.0)`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** -1, 0 or 1 when `a` is lower than, equal to or higher than `b`. */
export function compareVersions(a, b) {
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
}

/**
 * The version a release should carry. `bump` is patch, minor, major or custom; only `custom` takes a number
 * (equal to the current version is allowed: the first release tags the version the manifests already carry).
 */
export function nextVersion(current, bump, custom) {
  const base = parseVersion(current);
  if (bump !== "custom" && custom) throw new Error(`custom_version is only used with bump=custom (got bump=${bump})`);
  if (bump === "custom") {
    const wanted = parseVersion(custom);
    if (compareVersions(wanted, base) < 0) throw new Error(`Custom version ${custom} is lower than the current ${current}`);
    return custom;
  }
  if (bump === "major") return `${base.major + 1}.0.0`;
  if (bump === "minor") return `${base.major}.${base.minor + 1}.0`;
  if (bump === "patch") return `${base.major}.${base.minor}.${base.patch + 1}`;
  throw new Error(`Unknown bump "${bump}": expected patch, minor, major or custom`);
}
