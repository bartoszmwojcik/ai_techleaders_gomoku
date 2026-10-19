// Step 1: the running Node.js satisfies `engines.node` from the root package.json.
import { join } from "node:path";

/**
 * Parses the only `engines.node` form this repository uses: `>=MAJOR.MINOR[.PATCH]`.
 * Anything else is rejected explicitly instead of being waved through.
 *
 * @param {string} range
 * @returns {number[] | undefined}
 */
export function parseMinimumVersion(range) {
  const match = /^>=\s*(\d+)\.(\d+)(?:\.(\d+))?$/.exec(range.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : undefined;
}

/**
 * @param {string} version e.g. "22.23.3"
 * @param {number[]} minimum
 */
export function satisfies(version, minimum) {
  const actual = version.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const a = actual[i] ?? 0;
    const m = minimum[i] ?? 0;
    if (a !== m) return a > m;
  }
  return true;
}

/** @type {import("../main.mjs").Step} */
export const requirements = {
  label: "Wymagania",
  async run({ deps }) {
    const packageJson = JSON.parse(deps.fs.readFileSync(join(deps.root, "package.json"), "utf8"));
    const range = String(packageJson.engines?.node ?? "");
    const minimum = parseMinimumVersion(range);
    if (!minimum) {
      return {
        status: "failed",
        detail: `nieobsługiwany format engines.node: "${range}"`,
        hint: "Instalator rozumie tylko zakres w postaci >=X.Y[.Z] — popraw engines.node w package.json.",
      };
    }
    if (!satisfies(deps.nodeVersion, minimum)) {
      return {
        status: "failed",
        detail: `Node ${deps.nodeVersion}, wymagane ${range}`,
        hint: `Zainstaluj Node.js w wersji ${range} (np. przez nvm) i uruchom ponownie.`,
      };
    }
    return { status: "done", detail: `Node ${deps.nodeVersion} (wymagane ${range})` };
  },
};
