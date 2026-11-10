#!/usr/bin/env node
// Size of the browser code per player page, from a `next build` of Next 16 (Turbopack): modern JS + CSS, Brotli.
// Not product code (outside coverage). Spec `.ai/specs/2026-11-10-i18n.md`, I19.
//
//   node .ai/scripts/size-limit-config.mjs [packages/app] [--json] [--size-limit]
//
// The page set: `rootMainFiles` (framework, shared by every route), plus the `entryJSFiles`/`entryCSSFiles` of the
// layout and the page from `server/app/**/page_client-reference-manifest.js`. Polyfills (`nomodule`) are left out.
// "floor" is what every player page loads: rootMainFiles + the (frontend) layout. Each file is compressed on its own
// (Brotli, quality 11) and the sizes are summed, like `@size-limit/file`.
// `--size-limit` prints a `.size-limit.json` (paths + budgets in bytes) for the `size-limit` CLI instead of measuring.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import vm from "node:vm";

const args = process.argv.slice(2);
const appDir = resolve(args.find((arg) => !arg.startsWith("--")) ?? "packages/app");
const nextDir = join(appDir, ".next");
if (!existsSync(join(nextDir, "build-manifest.json"))) {
  console.error(`No build in ${nextDir}: run \`npm run build\` first.`);
  process.exit(1);
}

const buildManifest = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8"));
const root = buildManifest.rootMainFiles;

function* manifests(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* manifests(path);
    else if (entry.name === "page_client-reference-manifest.js") yield path;
  }
}

function readManifest(path) {
  const sandbox = { self: {}, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(path, "utf8"), sandbox);
  return sandbox.self.__RSC_MANIFEST ?? sandbox.__RSC_MANIFEST;
}

const pages = new Map();
let floor = null;
for (const path of manifests(join(nextDir, "server", "app"))) {
  for (const [route, manifest] of Object.entries(readManifest(path))) {
    if (!route.startsWith("/(frontend)")) continue;
    const files = new Set(root);
    for (const [entry, list] of Object.entries(manifest.entryJSFiles)) if (!entry.includes("next/dist/client/components/builtin")) list.forEach((file) => files.add(file));
    for (const [entry, list] of Object.entries(manifest.entryCSSFiles))
      if (!entry.includes("next/dist/client/components/builtin")) list.filter((css) => !css.inlined).forEach((css) => files.add(css.path));
    pages.set(route.replace("/(frontend)", "").replace(/\/page$/, "") || "/", [...files]);
    if (floor === null) {
      const layout = Object.entries(manifest.entryJSFiles).find(([entry]) => entry.endsWith("/(frontend)/layout"))?.[1] ?? [];
      const layoutCss = (Object.entries(manifest.entryCSSFiles).find(([entry]) => entry.endsWith("/(frontend)/layout"))?.[1] ?? []).map((css) => css.path);
      floor = [...new Set([...root, ...layout, ...layoutCss])];
    }
  }
}

const cache = new Map();
function brotli(file) {
  if (!cache.has(file)) {
    const data = readFileSync(join(nextDir, file));
    cache.set(file, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length);
  }
  return cache.get(file);
}
const size = (files) => files.reduce((sum, file) => sum + brotli(file), 0);

const rows = [["framework (rootMainFiles)", root], ["floor (rootMainFiles + (frontend) layout)", floor], ...[...pages].sort(([a], [b]) => a.localeCompare(b))];

if (args.includes("--size-limit")) {
  const config = rows.map(([name, files]) => ({
    name,
    path: files.map((file) => relative(process.cwd(), join(nextDir, file))),
    brotli: true,
    limit: `${size(files)} B`,
  }));
  console.log(JSON.stringify(config, null, 2));
} else if (args.includes("--json")) {
  console.log(JSON.stringify(Object.fromEntries(rows.map(([name, files]) => [name, size(files)])), null, 2));
} else {
  for (const [name, files] of rows) console.log(`${(size(files) / 1000).toFixed(1).padStart(7)} kB  ${name}`);
}
