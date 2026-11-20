// Compares a snapshot of the LikeC4 model (likec4-model.mjs) with the facts from the code (code-facts.mjs).
// Every rule works both ways: a fact without its element and an element pointing at nothing are both problems.
import { CONTAINER_FILE, ENTITIES_FILE } from "./code-facts.mjs";

const MODEL = "docs/architektura";

// Metadata key → the element kinds allowed to carry it, the kind that must carry it (optional), the source of the
// facts and the model file where it is added. A component without `di` is fine (e.g. the HTTP or MCP layer).
const PACKAGE_RULE = { key: "package", kinds: ["package", "container"], required: "package", what: "pakiet", assigned: "przypisany", it: "go", source: "packages/", where: `${MODEL}/model.c4` };
const DI_RULE = { key: "di", kinds: ["component"], what: "rejestracja", assigned: "przypisana", it: "ją", source: CONTAINER_FILE, where: `${MODEL}/model.c4` };
const ENTITY_RULE = { key: "entity", kinds: ["entity"], required: "entity", what: "encja", assigned: "przypisana", it: "ją", source: ENTITIES_FILE, where: `${MODEL}/data.c4` };

/** A metadata value (`'a, b'` or a list of such strings) as a list of names. */
export function names(value) {
  if (value === undefined) return [];
  return [value]
    .flat()
    .flatMap((item) => String(item).split(","))
    .map((name) => name.trim())
    .filter(Boolean);
}

function checkRule(rule, elements, facts) {
  const problems = [];
  const owners = new Map();
  for (const element of elements) {
    const declared = names(element.metadata?.[rule.key]);
    if (declared.length > 0 && !rule.kinds.includes(element.kind)) {
      problems.push(`model: element "${element.id}" (rodzaj ${element.kind}) ma metadata.${rule.key} — dozwolone tylko dla: ${rule.kinds.join(", ")}.`);
    }
    for (const name of declared) owners.set(name, [...(owners.get(name) ?? []), element.id]);
  }
  for (const element of elements) {
    if (element.kind === rule.required && names(element.metadata?.[rule.key]).length === 0) {
      problems.push(`model: element "${element.id}" (rodzaj ${element.kind}) nie ma metadata.${rule.key}.`);
    }
  }
  for (const fact of facts) {
    const ids = owners.get(fact) ?? [];
    if (ids.length === 0) {
      problems.push(`${rule.source}: ${rule.what} "${fact}" nie jest ${rule.assigned} do żadnego elementu — dopisz ${rule.it} do metadata.${rule.key} w ${rule.where}.`);
    } else if (ids.length > 1) {
      problems.push(`model: ${rule.what} "${fact}" jest ${rule.assigned} do kilku elementów (${ids.join(", ")}) — zostaw ${rule.it} w jednym.`);
    }
  }
  for (const [name, ids] of owners) {
    if (!facts.includes(name)) {
      problems.push(`model: metadata.${rule.key} "${name}" w ${ids.join(", ")} nie istnieje w ${rule.source} — usuń ją albo popraw nazwę.`);
    }
  }
  return problems;
}

/** Problems of the model against the code (empty = compliant). */
export function checkCompliance({ elements, packages, registrations, entities }) {
  return [
    ...checkRule(PACKAGE_RULE, elements, packages.map((pkg) => pkg.name)),
    ...checkRule(DI_RULE, elements, registrations),
    ...checkRule(ENTITY_RULE, elements, entities),
  ];
}
