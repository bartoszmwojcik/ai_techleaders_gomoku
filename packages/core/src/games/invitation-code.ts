import { INVITATION_CODE_ALPHABET, INVITATION_CODE_LENGTH } from "./constants";

/** Source of uniform integers in `[0, max)`; production passes `crypto.randomInt`. */
export type RandomInt = (max: number) => number;

/** Generates a code in storage form: 8 symbols of the alphabet, no separator. */
export function generateInvitationCode(randomInt: RandomInt): string {
  let code = "";
  for (let i = 0; i < INVITATION_CODE_LENGTH; i += 1) {
    code += INVITATION_CODE_ALPHABET[randomInt(INVITATION_CODE_ALPHABET.length)];
  }
  return code;
}

/** Display form `ABCD-EFGH` of a stored code. */
export function formatInvitationCode(code: string): string {
  const half = INVITATION_CODE_LENGTH / 2;
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

/**
 * Converts user input (any case, with or without a dash or spaces) to storage form.
 * Returns `null` for anything that cannot be a code, so callers answer with one uniform
 * "invalid invitation" for a bad shape and an unknown code alike.
 */
export function normalizeInvitationCode(input: string): string | null {
  const code = input.replace(/[\s-]+/g, "").toUpperCase();
  if (code.length !== INVITATION_CODE_LENGTH) return null;
  for (const symbol of code) {
    if (!INVITATION_CODE_ALPHABET.includes(symbol)) return null;
  }
  return code;
}

/** Link to the invitation page; the code is shown grouped, the page normalizes it back. */
export function invitationUrl(origin: string, code: string): string {
  return `${origin}/invite/${formatInvitationCode(code)}`;
}

/**
 * The code behind what an agent hands to `join` (E06-S01): exactly one of a code in any form
 * (`normalizeInvitationCode`) or a link to the invitation page whose last path segment is the
 * code (`https://host/invite/ABCD-EFGH`; query and fragment are ignored). The host is ignored
 * too and nothing is fetched. Anything else, several codes in one text included, is `null`.
 */
export function extractInvitationCode(input: string): string | null {
  const text = input.trim();
  const code = normalizeInvitationCode(text);
  if (code) return code;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const segment = url.pathname.split("/").filter((part) => part !== "").at(-1);
  return segment === undefined ? null : normalizeInvitationCode(segment);
}
