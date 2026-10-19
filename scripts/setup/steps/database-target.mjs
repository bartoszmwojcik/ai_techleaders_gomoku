// Step 4: resolve (and print) the database the remaining steps will use — the one
// `npm run dev` will connect to. A DATABASE_URL inherited from the process environment
// that differs from the .env files is refused unless --db-from-env confirms it.
import { maskSecrets, resolveDatabaseTarget } from "../env.mjs";

/** @type {import("../main.mjs").Step} */
export const databaseTarget = {
  label: "Cel bazy",
  async run(ctx) {
    const { deps, options } = ctx;
    const { loadEnvConfig } = await deps.loadNextEnv();
    const target = resolveDatabaseTarget({ root: deps.root, env: deps.env, loadEnvConfig });

    if (target.conflict && !options.dbFromEnv) {
      return {
        status: "failed",
        detail: `DATABASE_URL z otoczenia (${maskSecrets(target.url)}) różni się od ${target.conflict.source} (${maskSecrets(target.conflict.url)})`,
        hint: [
          "Instalator nie użyje bazy z otoczenia bez potwierdzenia — mogłaby to być cudza baza.",
          "Jeśli to zamierzone: npm run setup -- --db-from-env",
          "W przeciwnym razie usuń zmienną z otoczenia (unset DATABASE_URL) i uruchom ponownie.",
        ].join("\n"),
      };
    }

    ctx.state.databaseUrl = target.url;
    const source = target.conflict ? `${target.source}, --db-from-env` : target.source;
    return { status: "info", detail: `${maskSecrets(target.url)} (${source})` };
  },
};
