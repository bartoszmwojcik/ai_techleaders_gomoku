// `npm run setup` — idempotent installer. Runs the steps in order; every step first
// checks whether its effect already exists and only then acts. The first failure stops
// the run with a hint; completed steps are never rolled back (each is safe to repeat).
// Spec: .ai/specs/2026-10-19-npm-setup-installer.md
import { maskSecrets } from "./env.mjs";
import { STEPS } from "./steps/index.mjs";
import { defaultDeps } from "./system.mjs";

/**
 * @typedef {"done" | "skipped" | "info" | "failed"} StepStatus
 * @typedef {{ status: StepStatus, detail: string, hint?: string }} StepResult
 * @typedef {{ withBrowser: boolean, dbFromEnv: boolean }} Options
 * @typedef {{ databaseUrl?: string, pendingMigrations?: number }} State
 * @typedef {{ deps: import("./system.mjs").Deps, options: Options, state: State }} Context
 * @typedef {{ label: string, run: (ctx: Context) => Promise<StepResult> }} Step
 */

export const USAGE = `Użycie: npm run setup [-- <opcje>]

Przygotowuje repozytorium do pracy: wymagania, zależności (npm ci), .env.local,
baza PostgreSQL (docker compose), migracje. Można uruchamiać wielokrotnie —
kroki już wykonane są pomijane.

Opcje:
  --with-browser   zainstaluj też Chrome dla agent-browser (testy integracyjne)
  --db-from-env    użyj DATABASE_URL z otoczenia procesu, nawet gdy różni się od plików .env*
  --help           pokaż tę pomoc`;

const FLAGS = /** @type {const} */ ({ "--with-browser": "withBrowser", "--db-from-env": "dbFromEnv" });

const SYMBOLS = /** @type {const} */ ({ done: "✓", skipped: "–", info: "ℹ", failed: "✗" });

/**
 * @param {string[]} argv
 * @returns {{ help: true } | { help: false, options: Options } | { error: string }}
 */
export function parseArgs(argv) {
  /** @type {Options} */
  const options = { withBrowser: false, dbFromEnv: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { help: true };
    if (!Object.hasOwn(FLAGS, arg)) return { error: `Nieznana opcja: ${arg}` };
    options[FLAGS[/** @type {keyof typeof FLAGS} */ (arg)]] = true;
  }
  return { help: false, options };
}

/**
 * @param {string} label
 * @param {StepResult} result
 */
export function formatLine(label, { status, detail }) {
  return `${SYMBOLS[status]} ${label} — ${detail}`;
}

/**
 * @param {string[]} argv
 * @param {import("./system.mjs").Deps} [deps]
 * @param {Step[]} [steps]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, deps = defaultDeps, steps = STEPS) {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    deps.log(`${parsed.error}\n\n${USAGE}`);
    return 1;
  }
  if (parsed.help) {
    deps.log(USAGE);
    return 0;
  }

  /** @type {Context} */
  const ctx = { deps, options: parsed.options, state: {} };
  for (const step of steps) {
    const result = await runStep(step, ctx);
    deps.log(formatLine(step.label, result));
    if (result.status === "failed") {
      if (result.hint) deps.log(`\n${result.hint}`);
      deps.log("\nInstalator przerwany. Po usunięciu przyczyny uruchom ponownie: npm run setup");
      return 1;
    }
  }
  deps.log("\nGotowe. Uruchom aplikację: npm run dev  (http://localhost:3000)");
  return 0;
}

/**
 * A step reports expected failures as results; anything thrown is a bug or an
 * environment problem, reported the same way instead of crashing with a stack trace.
 *
 * @param {Step} step
 * @param {Context} ctx
 * @returns {Promise<StepResult>}
 */
async function runStep(step, ctx) {
  try {
    return await step.run(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", detail: `nieoczekiwany błąd: ${maskSecrets(message)}` };
  }
}
