// Step 2: dependencies installed exactly from package-lock.json (`npm ci`). A marker in
// node_modules records the lockfile hash, so a second run skips the install. `npm ci`
// (not `npm install`) never rewrites the lockfile — see lesson 2026-10-19-npm-lockfile-libc.
import { createHash } from "node:crypto";
import { join } from "node:path";

export const MARKER = "node_modules/.gomoku-setup.json";
const NPM_CI_TIMEOUT_MS = 15 * 60_000;

/** @type {import("../main.mjs").Step} */
export const dependencies = {
  label: "Zależności",
  async run({ deps }) {
    const lockHash = createHash("sha256")
      .update(deps.fs.readFileSync(join(deps.root, "package-lock.json")))
      .digest("hex");
    const markerPath = join(deps.root, MARKER);
    if (readMarker(deps, markerPath) === lockHash) {
      return { status: "skipped", detail: "pominięto: node_modules zgodne z package-lock.json" };
    }

    const result = await deps.run("npm", ["ci"], { cwd: deps.root, env: deps.env, timeoutMs: NPM_CI_TIMEOUT_MS });
    if (result.code !== 0) {
      return {
        status: "failed",
        detail: result.timedOut ? "npm ci przekroczyło limit czasu" : `npm ci zakończone błędem (kod ${result.code})`,
        hint: [
          lastLines(result.stderr),
          "Na Windows zatrzymaj działające `npm run dev` (zablokowane pliki w node_modules) i uruchom ponownie.",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }

    deps.fs.writeFileSync(markerPath, `${JSON.stringify({ lockHash }, null, 2)}\n`);
    return { status: "done", detail: "zainstalowano zależności (npm ci)" };
  },
};

/**
 * @param {import("../system.mjs").Deps} deps
 * @param {string} path
 * @returns {string | undefined}
 */
function readMarker(deps, path) {
  if (!deps.fs.existsSync(path)) return undefined;
  try {
    return JSON.parse(deps.fs.readFileSync(path, "utf8")).lockHash;
  } catch {
    return undefined; // A corrupt marker means "not installed": npm ci rebuilds it.
  }
}

/** @param {string} text */
export function lastLines(text, count = 10) {
  return text.trim().split("\n").slice(-count).join("\n");
}
