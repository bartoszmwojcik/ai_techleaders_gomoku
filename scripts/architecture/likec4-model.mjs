// The only module that knows the LikeC4 API: loads the model in docs/architektura and returns a plain snapshot
// (diagnostics and elements with their metadata) for the compliance check.
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Imports `likec4` from the tooling package in `toolDir` (outside the npm workspaces, see docs/architektura/package.json). */
export async function importLikeC4From(toolDir) {
  const require = createRequire(resolve(toolDir, "package.json"));
  let entry;
  try {
    entry = require.resolve("likec4");
  } catch {
    throw new Error(`Brak pakietu likec4 w ${toolDir} — uruchom \`npm ci --prefix docs/architektura\`.`);
  }
  return import(pathToFileURL(entry).href);
}

/** `path:line:column message` with the path relative to the workspace (LikeC4 ranges are 0-based). */
function formatDiagnostic(workspace, { message, sourceFsPath, range }) {
  const where = sourceFsPath ? relative(workspace, sourceFsPath) : "(model)";
  const position = range ? `:${range.start.line + 1}:${range.start.character + 1}` : "";
  return `${where}${position} ${message}`;
}

/**
 * Loads the LikeC4 workspace and returns `{ errors, elements }`: `errors` are the model's diagnostics
 * (syntax, unknown references, duplicates), `elements` are `{ id, kind, metadata }` of every element.
 */
export async function loadModel({ workspace, importLikeC4 = () => importLikeC4From(workspace) }) {
  const { LikeC4 } = await importLikeC4();
  const likec4 = await LikeC4.fromWorkspace(workspace, { printErrors: false, logger: false });
  try {
    const errors = likec4.getErrors().map((diagnostic) => formatDiagnostic(workspace, diagnostic));
    const model = await likec4.computedModel();
    const elements = [...model.elements()].map((element) => ({
      id: element.id,
      kind: element.kind,
      metadata: element.getMetadata(),
    }));
    return { errors, elements };
  } finally {
    await likec4.dispose();
  }
}
