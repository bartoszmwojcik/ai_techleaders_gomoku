const POLISH_LETTERS = "ąćęłńóśźż";
const LATIN_LETTERS = "acelnoszz";

/** Canonical form of an e-mail address: trimmed and lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Uniqueness key of a display name (G4, G6): lower-case, Polish letters
 * mapped to Latin ones, `_` and `-` removed.
 */
export function normalizeDisplayName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (char) =>
      LATIN_LETTERS.charAt(POLISH_LETTERS.indexOf(char)),
    )
    .replace(/[_-]/g, "");
}
