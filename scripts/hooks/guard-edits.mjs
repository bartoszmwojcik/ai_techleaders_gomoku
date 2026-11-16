// PreToolUse guard for Edit|Write|MultiEdit (see "Testy" and "MikroORM" in AGENTS.md):
// existing migration files are immutable and coverage-ignore comments are forbidden.
import { isAbsolute, relative } from "node:path";

const MIGRATION = /^packages\/db\/src\/migrations\/Migration[^/]*\.ts$/;
// Same rule and scope as the CI step "No coverage ignore comments" (`git grep -nE "(v8|c8|istanbul) ignore" -- packages`):
// only code under packages/ is checked, so docs and skills may still name the comments.
const IGNORE_COMMENT = /\b(?:v8|c8|istanbul)\s+ignore\b/;
const CHECKED_FOR_IGNORE = /^packages\//;

function newTexts(toolName, toolInput) {
  if (toolName === "Write") return [toolInput.content];
  if (toolName === "Edit") return [toolInput.new_string];
  return (toolInput.edits ?? []).map((edit) => edit.new_string);
}

export function checkEdit({ toolName, toolInput = {}, fileExists, cwd = process.cwd() }) {
  if (!["Edit", "Write", "MultiEdit"].includes(toolName)) return null;
  const path = toolInput.file_path ?? "";
  const rel = (isAbsolute(path) ? relative(cwd, path) : path).split("\\").join("/");
  if (MIGRATION.test(rel) && (toolName !== "Write" || fileExists(path))) {
    return `Blocked: ${rel} is an existing migration. Applied migrations are generated files and must not be edited; create a new one with npm run db:migration:create (AGENTS.md, "MikroORM").`;
  }
  if (CHECKED_FOR_IGNORE.test(rel) && newTexts(toolName, toolInput).some((text) => IGNORE_COMMENT.test(text ?? ""))) {
    return `Blocked: coverage ignore comments (v8, c8, istanbul) are not allowed in ${rel}. Restructure the code so it is testable instead (AGENTS.md, "Testy").`;
  }
  return null;
}
