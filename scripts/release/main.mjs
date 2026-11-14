// `node scripts/release/cli.mjs <command>` — helpers of .github/workflows/release.yml. Exit code 0 = ok.
//   current                       prints the version of the root package.json
//   next <bump> [custom_version]  prints the version a release would carry (bump: patch|minor|major|custom)
//   notes <version>               prints the CHANGELOG.md entry of that version (release notes)
//   bump <version>                writes the version into every package.json and package-lock.json
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bumpVersion } from "./bump.mjs";
import { releaseNotes } from "./changelog.mjs";
import { nextVersion, parseVersion } from "./version.mjs";

const currentVersion = (root) => JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

export function main(argv, { root, log, error }) {
  const [command, first, second] = argv;
  try {
    if (command === "current") {
      log(currentVersion(root));
      return 0;
    }
    if (command === "next") {
      log(nextVersion(currentVersion(root), first, second));
      return 0;
    }
    if (command === "notes") {
      parseVersion(first);
      log(releaseNotes(readFileSync(join(root, "CHANGELOG.md"), "utf8"), first));
      return 0;
    }
    if (command === "bump") {
      parseVersion(first);
      for (const file of bumpVersion(root, first)) log(`updated ${file}`);
      return 0;
    }
  } catch (problem) {
    error(problem.message);
    return 1;
  }
  error("Usage: cli.mjs current | next <bump> [custom_version] | notes <version> | bump <version>");
  return 2;
}
