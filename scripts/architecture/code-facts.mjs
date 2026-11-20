// Facts from the code that the architecture model must cover: workspace packages, DI registrations in
// container.ts and the entity registry. Sources are parsed with the TypeScript compiler (no regular expressions on
// source, no importing application modules); a shape the parser does not recognize is a problem, never skipped.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

export const CONTAINER_FILE = "packages/app/src/server/container.ts";
export const ENTITIES_FILE = "packages/db/src/entities/index.ts";

/** `{ dir, name }` of every `packages/<dir>` with a package.json. */
export function readPackages(root) {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ dir: entry.name, name: JSON.parse(readFileSync(join(root, "packages", entry.name, "package.json"), "utf8")).name }));
}

function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function line(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function propertyName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/** Keys of every object literal passed to a `.register({...})` call. */
export function registrationKeys(text, file = CONTAINER_FILE) {
  const source = parse(file, text);
  const keys = [];
  const problems = [];
  let calls = 0;
  visit(source, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "register") return;
    calls += 1;
    const [arg] = node.arguments;
    if (!arg || !ts.isObjectLiteralExpression(arg)) {
      problems.push(`${file}:${line(source, node)}: register() bez literału obiektu — test zgodności nie rozpozna rejestracji, zapisz je jako register({ nazwa: … }).`);
      return;
    }
    for (const property of arg.properties) {
      const name = (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && propertyName(property.name);
      if (name) keys.push(name);
      else problems.push(`${file}:${line(source, property)}: nierozpoznana rejestracja (spread albo klucz wyliczany) — zapisz ją jako zwykłą właściwość.`);
    }
  });
  if (calls === 0) problems.push(`${file}: brak wywołań register({...}) — test zgodności nie znalazł rejestracji DI.`);
  return { keys, problems };
}

function unwrap(expression) {
  return ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression) ? unwrap(expression.expression) : expression;
}

/** Identifiers in the exported `entities` array. */
export function entityNames(text, file = ENTITIES_FILE) {
  const source = parse(file, text);
  const names = [];
  const problems = [];
  let found = false;
  visit(source, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== "entities") return;
    found = true;
    const array = node.initializer && unwrap(node.initializer);
    if (!array || !ts.isArrayLiteralExpression(array)) {
      problems.push(`${file}:${line(source, node)}: \`entities\` nie jest literałem tablicy — test zgodności nie rozpozna encji.`);
      return;
    }
    for (const element of array.elements) {
      if (ts.isIdentifier(element)) names.push(element.text);
      else problems.push(`${file}:${line(source, element)}: nierozpoznany element tablicy \`entities\` — wpisz samą nazwę encji.`);
    }
  });
  if (!found) problems.push(`${file}: brak tablicy \`entities\`.`);
  return { names, problems };
}

/** All facts at once, read from the repository at `root`. */
export function readCodeFacts(root) {
  const registrations = registrationKeys(readFileSync(join(root, CONTAINER_FILE), "utf8"));
  const entities = entityNames(readFileSync(join(root, ENTITIES_FILE), "utf8"));
  return {
    packages: readPackages(root),
    registrations: registrations.keys,
    entities: entities.names,
    problems: [...registrations.problems, ...entities.problems],
  };
}
