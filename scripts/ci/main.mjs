// `node scripts/ci/cli.mjs scope` reads the changed files (one per line) from stdin and prints `code=true|false`;
// `node scripts/ci/cli.mjs skills-lock` checks skills-lock.json against .agents/skills. Exit code 0 = ok.
import { classify } from "./scope.mjs";
import { verifySkillsLock } from "./skills-lock.mjs";

export async function main(argv, { readStdin, root, log }) {
  const [command] = argv;
  if (command === "scope") {
    const { code, codeFiles } = classify((await readStdin()).split("\n"));
    log(`code=${code}`);
    for (const file of codeFiles) console.error(`code: ${file}`);
    return 0;
  }
  if (command === "skills-lock") {
    const problems = verifySkillsLock(root);
    for (const problem of problems) log(problem);
    if (problems.length === 0) log("skills-lock.json matches .agents/skills");
    return problems.length === 0 ? 0 : 1;
  }
  console.error("Usage: cli.mjs scope|skills-lock");
  return 2;
}
