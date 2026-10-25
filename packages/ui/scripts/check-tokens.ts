// Fails when UI source contains values that bypass the design tokens (see src/tools).
// Scans the game components only (src/game). The token file, the Storybook configuration, the story
// files and the documentation pages are not scanned (owner decision 2026-10-25).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { findUntokenizedValues } from "../src/tools/find-untokenized-values.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const SCANNED = ["src/game"];
const EXTENSIONS = /\.(?:ts|tsx|css)$/;
const SKIPPED = /(?:\.test\.tsx?|\.d\.ts)$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (EXTENSIONS.test(entry.name) && !SKIPPED.test(entry.name)) yield path;
  }
}

let count = 0;
for (const scanned of SCANNED) {
  const dir = join(root, scanned);
  try {
    readdirSync(dir);
  } catch {
    continue;
  }
  for (const file of walk(dir)) {
    for (const { line, kind, match } of findUntokenizedValues(readFileSync(file, "utf8"))) {
      console.error(`${relative(root, file)}:${line}  ${kind}  ${match}`);
      count += 1;
    }
  }
}

if (count > 0) {
  console.error(`\n${count} value(s) outside the design tokens.`);
  process.exit(1);
}
console.log("No values outside the design tokens.");
