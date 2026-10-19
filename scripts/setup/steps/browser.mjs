// Step 7 (opt-in, --with-browser): Chrome for agent-browser, needed by the integration
// tests. `agent-browser install` itself does not download Chrome again when present.
import { lastLines } from "./dependencies.mjs";

const INSTALL_TIMEOUT_MS = 10 * 60_000;

/** @type {import("../main.mjs").Step} */
export const browser = {
  label: "Przeglądarka",
  async run({ deps, options }) {
    if (!options.withBrowser) return { status: "skipped", detail: "pominięto (bez --with-browser)" };

    const result = await deps.run("npx", ["agent-browser", "install"], {
      cwd: deps.root,
      env: deps.env,
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
    if (result.code !== 0) {
      return {
        status: "failed",
        detail: "agent-browser install zakończone błędem",
        hint: [lastLines(result.stderr), "Na Linuksie brakujące biblioteki doinstaluje: npx agent-browser install --with-deps"]
          .filter(Boolean)
          .join("\n"),
      };
    }
    return { status: "done", detail: "Chrome dla agent-browser gotowy" };
  },
};
