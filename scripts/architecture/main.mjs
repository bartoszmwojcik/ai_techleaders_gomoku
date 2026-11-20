// `node scripts/architecture/cli.mjs check` validates the LikeC4 model (docs/architektura) and checks that it covers
// the code (packages, DI registrations, entities); `ensure` only checks that the tooling package is installed
// (run before `likec4 serve|build`). Exit code 0 = ok, 1 = problems, 2 = usage or missing tooling.
import { existsSync } from "node:fs";
import { join } from "node:path";

import { checkCompliance } from "./compliance.mjs";

export const TOOL_DIR = "docs/architektura";
const INSTALL_HINT = `Brak pakietu likec4 w ${TOOL_DIR} — uruchom \`npm ci --prefix ${TOOL_DIR}\`.`;

export async function main(argv, { root, loadModel, readCodeFacts, log, error }) {
  const [command] = argv;
  const workspace = join(root, TOOL_DIR);
  if (command !== "check" && command !== "ensure") {
    error("Usage: cli.mjs check|ensure");
    return 2;
  }
  if (!existsSync(join(workspace, "node_modules", "likec4"))) {
    error(INSTALL_HINT);
    return 2;
  }
  if (command === "ensure") return 0;

  const model = await loadModel({ workspace });
  const facts = readCodeFacts(root);
  const problems = [...model.errors.map((message) => `${TOOL_DIR}/${message}`), ...facts.problems];
  // Compliance on a broken model or unparsed code would only add noise to the real error.
  if (problems.length === 0) problems.push(...checkCompliance({ elements: model.elements, ...facts }));
  for (const problem of problems) error(problem);
  if (problems.length > 0) {
    error(`Model architektury nie zgadza się z kodem (${problems.length}). Podgląd: npm run docs:arch.`);
    return 1;
  }
  log(`Model architektury jest zgodny z kodem (pakiety: ${facts.packages.length}, rejestracje DI: ${facts.registrations.length}, encje: ${facts.entities.length}).`);
  return 0;
}
