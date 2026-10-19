// Step 3: .env.local created from .env.example — only when it does not exist, never
// overwritten (it may hold the developer's own settings).
import { join } from "node:path";

/** @type {import("../main.mjs").Step} */
export const envLocal = {
  label: "Konfiguracja",
  async run({ deps }) {
    const target = join(deps.root, ".env.local");
    if (deps.fs.existsSync(target)) return { status: "skipped", detail: "pominięto: .env.local już istnieje" };

    const example = join(deps.root, ".env.example");
    if (!deps.fs.existsSync(example)) {
      return {
        status: "failed",
        detail: "brak .env.example",
        hint: "Przywróć .env.example z repozytorium (git checkout -- .env.example).",
      };
    }
    deps.fs.copyFileSync(example, target);
    return { status: "done", detail: "utworzono .env.local z .env.example" };
  },
};
