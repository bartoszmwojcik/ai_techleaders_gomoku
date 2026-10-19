// Step 6: pending migrations applied. The database step already counted them through
// `db:status`, so a migrated database is skipped without running the MikroORM CLI.
import { maskSecrets } from "../env.mjs";
import { lastLines } from "./dependencies.mjs";

const MIGRATION_TIMEOUT_MS = 5 * 60_000;

/** Polish plural of "migracja" for a count. */
export function migrationsLabel(/** @type {number} */ count) {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (count === 1) return "1 migrację";
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} migracje`;
  return `${count} migracji`;
}

/** @type {import("../main.mjs").Step} */
export const migrations = {
  label: "Migracje",
  async run({ deps, state }) {
    if (state.pendingMigrations === 0) return { status: "skipped", detail: "pominięto: brak oczekujących migracji" };

    const result = await deps.run("npm", ["run", "db:migration:up"], {
      cwd: deps.root,
      env: { ...deps.env, DATABASE_URL: state.databaseUrl },
      timeoutMs: MIGRATION_TIMEOUT_MS,
    });
    if (result.code !== 0) {
      return {
        status: "failed",
        detail: result.timedOut ? "migracje przekroczyły limit czasu" : `db:migration:up zakończone błędem (kod ${result.code})`,
        hint: maskSecrets(lastLines(`${result.stdout}\n${result.stderr}`)),
      };
    }
    const applied = state.pendingMigrations === undefined ? "oczekujące migracje" : migrationsLabel(state.pendingMigrations);
    return { status: "done", detail: `zastosowano ${applied}` };
  },
};
