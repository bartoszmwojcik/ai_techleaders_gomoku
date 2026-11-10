import ts from "typescript";

/** A user-facing text written into code instead of a catalog. */
export type UiLiteral = { file: string; line: number; text: string };

/** A literal kept on purpose: the file, the exact text and why (spec I11, `i18n-allowlist.ts`). */
export type AllowedLiteral = { file: string; text: string; reason: string };

const POLISH_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

/**
 * Polish words without Polish letters that mark a sentence for a player. Checked only where a text is certainly shown
 * (JSX text and labelling attributes), because in other strings they collide with paths and identifiers.
 */
const POLISH_WORDS = /\b(nie|jest|albo|oraz|lub|dla|przez|teraz|konto|partia|partie|gracz|gracza|zaloguj|wyloguj|zapisz|anuluj|dalej|wstecz|jasny|ciemny|motyw|historia|zamknij|pokaz|plansza)\b/i;

/** Attributes whose value is read out or shown: `aria-label`, `title`, `alt`, `placeholder`, `label`, `*Label`, … */
function isLabelAttribute(name: string): boolean {
  return /^(aria-label|title|alt|placeholder|label|details|description|message)$/.test(name) || /Label$/.test(name);
}

/** The user-facing literals of one source file; comments and module specifiers are never scanned. */
export function findUiLiterals(file: string, source: string): UiLiteral[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: UiLiteral[] = [];

  function report(node: ts.Node, text: string) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    found.push({ file, line, text: text.trim() });
  }

  function inLabelAttribute(node: ts.Node): boolean {
    let parent = node.parent;
    while (!ts.isSourceFile(parent) && !ts.isJsxElement(parent) && !ts.isJsxSelfClosingElement(parent)) {
      if (ts.isJsxAttribute(parent)) return isLabelAttribute(parent.name.getText(sourceFile));
      parent = parent.parent;
    }
    return false;
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) {
      if (POLISH_LETTERS.test(node.text) || POLISH_WORDS.test(node.text)) report(node, node.text);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (POLISH_LETTERS.test(node.text) || (POLISH_WORDS.test(node.text) && inLabelAttribute(node))) report(node, node.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

/** The literals not covered by an allowlist entry for the same file and text. */
export function withoutAllowed(found: readonly UiLiteral[], allowed: readonly AllowedLiteral[]): UiLiteral[] {
  return found.filter((literal) => !allowed.some((entry) => entry.file === literal.file && entry.text === literal.text));
}
