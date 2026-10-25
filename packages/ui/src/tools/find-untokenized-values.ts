export type ViolationKind =
  | "color-literal"
  | "palette-class"
  | "arbitrary-value"
  | "spacing-off-scale"
  | "scale-class";

export type Violation = { line: number; kind: ViolationKind; match: string };

type Rule = {
  kind: ViolationKind;
  pattern: RegExp;
  /** Returns true when a regex match is allowed after all. */
  accept?: (found: RegExpMatchArray) => boolean;
};

// Spacing steps of the 4 px grid (p-1 = 4 px ... p-12 = 48 px); named steps (p-panel) never match.
const SPACING_SCALE = new Set(["0", "1", "2", "3", "4", "6", "8", "12"]);

const PALETTE_NAMES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTILITIES =
  "bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|shadow";
const SPACING_UTILITIES = "p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y";

const RULES: readonly Rule[] = [
  { kind: "color-literal", pattern: /#[0-9a-fA-F]{3,8}(?![\w-])/g },
  { kind: "color-literal", pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g },
  {
    kind: "palette-class",
    pattern: new RegExp(
      `(?<![\\w-])(?:${COLOR_UTILITIES})-(?:(?:${PALETTE_NAMES})-\\d{2,3}|white|black)(?![\\w-])`,
      "g",
    ),
  },
  {
    kind: "arbitrary-value",
    pattern: /(?<![\w-])((?:[a-z][a-z0-9]*-)+)\[([^\]]+)\]/g,
    // Values derived from a token (var(--...)) and variant selectors (data-[...], aria-[...]) are fine.
    accept: ([, prefix, inner]) =>
      /^(?:data|aria|group|peer|has|supports)-$/.test(prefix as string) || (inner as string).includes("var(--"),
  },
  {
    kind: "spacing-off-scale",
    pattern: new RegExp(`(?<![\\w-])-?(?:${SPACING_UTILITIES})-(\\d+(?:\\.\\d+)?)(?![\\w./-])`, "g"),
    accept: ([, step]) => SPACING_SCALE.has(step as string),
  },
  {
    kind: "scale-class",
    pattern:
      /(?<![\w-])(?:rounded(?:-[a-z]{1,2})?-(?:sm|md|lg|xl|2xl|3xl|full)|shadow-(?:xs|sm|md|lg|xl|2xl|inner)|text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-(?:thin|light|normal|medium|semibold|bold|extrabold|black))(?![\w-])/g,
  },
];

/**
 * Finds values in UI source that bypass the design tokens: colour literals, Tailwind palette classes,
 * arbitrary Tailwind values, spacing steps off the 4 px grid and default Tailwind scales (radius,
 * shadow, text size, font weight). Token files are not scanned by the caller.
 */
export function findUntokenizedValues(source: string): Violation[] {
  const violations: Violation[] = [];
  source.split("\n").forEach((text, index) => {
    for (const { kind, pattern, accept } of RULES) {
      for (const found of text.matchAll(pattern)) {
        if (accept?.(found)) continue;
        violations.push({ line: index + 1, kind, match: found[0] });
      }
    }
  });
  return violations;
}
