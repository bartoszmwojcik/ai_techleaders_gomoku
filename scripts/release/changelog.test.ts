import { describe, expect, it } from "vitest";

import { releaseNotes } from "./changelog.mjs";

const CHANGELOG = `# 1.1.0 (2026-12-01)

## Highlights
<!-- TODO: Highlights -->
Nowy wariant.

## ✨ Features
- ✨ Coś nowego. (#2)

---

# 1.0.0 (2026-11-14)

## ✨ Features
- ✨ Pierwsze wydanie. (#1)
`;

describe("releaseNotes", () => {
  it("returns the entry without its heading, the placeholder comment and the next release", () => {
    expect(releaseNotes(CHANGELOG, "1.1.0")).toBe("## Highlights\n\nNowy wariant.\n\n## ✨ Features\n- ✨ Coś nowego. (#2)");
  });

  it("reads the last entry up to the end of the file", () => {
    expect(releaseNotes(CHANGELOG, "1.0.0")).toBe("## ✨ Features\n- ✨ Pierwsze wydanie. (#1)");
  });

  it("stops at the next release heading when there is no separator", () => {
    expect(releaseNotes("# 2.0.0 (2026-01-02)\nA\n# 1.0.0 (2026-01-01)\nB\n", "2.0.0")).toBe("A");
  });

  it("collapses the blank lines a dropped comment leaves behind", () => {
    expect(releaseNotes("# 2.0.0 (2026-01-02)\n\n## Highlights\n<!-- TODO -->\n\n## Fixes\nA\n", "2.0.0")).toBe("## Highlights\n\n## Fixes\nA");
  });

  it("does not match another version by prefix or by the dots as wildcards", () => {
    expect(() => releaseNotes(CHANGELOG, "1.1")).toThrow(/no entry/);
    expect(() => releaseNotes("# 1x1x0 (2026-12-01)\nA\n", "1.1.0")).toThrow(/no entry/);
  });

  it("fails when the entry is missing or has no content", () => {
    expect(() => releaseNotes(CHANGELOG, "9.9.9")).toThrow(/no entry "# 9\.9\.9 \(YYYY-MM-DD\)"/);
    expect(() => releaseNotes("# 1.0.0 (2026-01-01)\n<!-- TODO -->\n\n---\n", "1.0.0")).toThrow(/entry for 1\.0\.0 is empty/);
  });
});
