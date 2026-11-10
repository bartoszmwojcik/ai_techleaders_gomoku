import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { I18N_ALLOWLIST } from "./i18n-allowlist";
import { findUiLiterals, withoutAllowed } from "./ui-literals";

const SRC = resolve(import.meta.dirname, "..");

/**
 * Groups of screens already moved to the catalogs (spec I11): a Polish text written into one of these files fails here.
 * Every migration package (phase B and C) adds its globs, relative to `packages/app/src`.
 */
export const ENFORCED_GROUPS: readonly string[] = [
  // E15-S01: the top bar of every player page.
  "app/(frontend)/layout.tsx",
  "components/theme/theme-toggle.tsx",
  "components/i18n/*.tsx",
  "components/auth/session-menu.tsx",
  "components/auth/account-menu.tsx",
  "components/auth/logout-button.tsx",
];

const isTest = (file: string) => /\.test\.tsx?$/.test(file);

describe("no Polish UI literals in migrated groups", () => {
  const files = ENFORCED_GROUPS.flatMap((pattern) => globSync(pattern, { cwd: SRC })).filter((file) => !isTest(file));

  it("every group matches at least one file", () => {
    for (const pattern of ENFORCED_GROUPS) expect(globSync(pattern, { cwd: SRC }), pattern).not.toEqual([]);
  });

  it.each(files)("%s", (file) => {
    expect(withoutAllowed(findUiLiterals(file, readFileSync(resolve(SRC, file), "utf8")), I18N_ALLOWLIST)).toEqual([]);
  });

  it("the allowlist names only files of the groups, with a reason", () => {
    for (const entry of I18N_ALLOWLIST) {
      expect(files).toContain(entry.file);
      expect(entry.reason.trim()).not.toBe("");
    }
  });
});

describe("findUiLiterals", () => {
  const scan = (source: string) => findUiLiterals("sample.tsx", source).map(({ line, text }) => `${line}:${text}`);

  it("finds Polish texts in JSX, attributes, strings and templates", () => {
    const source = [
      'import { x } from "./żółw";',
      "// Wyloguj — a comment is never scanned",
      "export const A = () => <p title=\"Zamknij okno\" data-x=\"partia\">Trwa partia</p>;",
      'const s = "Zażółć";',
      "const t = `Gracz ${name} się poddał`;",
      "const u = `a ${b} środek ${c} koniec ść`;",
      'const v = <Menu menuLabel="Konto gracza" other="motyw" />;',
      "const w = `bez polskich liter`;",
      'const y = <a aria-label={"Jasny"}>x</a>;',
      'export { z } from "./ąę";',
    ].join("\n");

    expect(scan(source)).toEqual([
      "3:Zamknij okno",
      "3:Trwa partia",
      "4:Zażółć",
      "5:się poddał",
      "6:środek",
      "6:koniec ść",
      "7:Konto gracza",
      "9:Jasny",
    ]);
  });

  it("ignores English, identifiers and Polish words outside shown places", () => {
    expect(scan('const a = "/konto"; const b = <p>{label}</p>; const c = <p>Log out</p>; f("nie");')).toEqual([]);
  });

  it("leaves out allowed literals of the same file only", () => {
    const found = [
      { file: "a.tsx", line: 1, text: "Zażółć" },
      { file: "b.tsx", line: 2, text: "Zażółć" },
    ];
    expect(withoutAllowed(found, [{ file: "a.tsx", text: "Zażółć", reason: "brand" }])).toEqual([found[1]]);
  });
});
