// Copies the newest revision of every discovery prototype into the Storybook static folder,
// so that it is served at http://localhost:6006/prototypes/<slug>/index.html (always the latest revision).
// Only the slug folders found in .ai/prototypes/discovery are touched; other folders in
// packages/ui/.storybook/public/prototypes (e.g. built clickable prototypes) are left alone.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, ".ai", "prototypes", "discovery");
const target = join(root, "packages", "ui", ".storybook", "public", "prototypes");
const port = process.env.STORYBOOK_PORT ?? "6006";

const dirs = (path) =>
  readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory());

if (!existsSync(source)) {
  console.log(`Brak prototypów w ${source}`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });

let synced = 0;
for (const slug of dirs(source).sort()) {
  // Revision folders are zero-padded (revision-001, revision-002, ...), so a plain sort finds the newest.
  const revisions = dirs(join(source, slug)).filter((name) => /^revision-\d+$/.test(name)).sort();
  const latest = revisions.at(-1);
  if (!latest || !existsSync(join(source, slug, latest, "index.html"))) {
    console.warn(`Pomijam ${slug}: brak rewizji z index.html`);
    continue;
  }
  const destination = join(target, slug);
  rmSync(destination, { recursive: true, force: true });
  cpSync(join(source, slug, latest), destination, { recursive: true });
  console.log(`http://localhost:${port}/prototypes/${slug}/index.html  (${latest})`);
  synced += 1;
}

console.log(`Zsynchronizowano prototypów: ${synced}`);
