// The release notes of one version: the body of its `# X.Y.Z (YYYY-MM-DD)` entry in CHANGELOG.md.
const ENTRY = /^# \d+\.\d+\.\d+ \(/;
const SEPARATOR = /^---\s*$/;

/**
 * Returns the entry for `version` without its heading, from the line after it up to the next release heading
 * or `---` separator. HTML comments (the Highlights placeholder) are dropped. Throws when the entry is missing
 * or has no content, so a release never goes out with empty notes.
 */
export function releaseNotes(changelog, version) {
  const lines = changelog.split("\n");
  const heading = new RegExp(`^# ${version.replaceAll(".", "\\.")} \\(\\d{4}-\\d{2}-\\d{2}\\)\\s*$`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) throw new Error(`CHANGELOG.md has no entry "# ${version} (YYYY-MM-DD)" — write it first (om-auto-update-changelog)`);
  const length = lines.slice(start + 1).findIndex((line) => ENTRY.test(line) || SEPARATOR.test(line));
  const body = lines
    .slice(start + 1, length === -1 ? lines.length : start + 1 + length)
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!body) throw new Error(`The CHANGELOG.md entry for ${version} is empty`);
  return body;
}
