/** Longest declared model name of an agent, counted in code points (E06-S01, decision 7 of #138). */
export const AGENT_NAME_MAX_LENGTH = 40;

// After NFKC: the Latin script (Roman-numeral compatibility signs, the only non-letters of the
// script, have become ASCII letters), ASCII digits, a plain space and `. - _ / : ( ) +`. Cyrillic
// and Greek are out for the same reason as in display names: look-alike letters.
const AGENT_NAME_PATTERN = /^[\p{Script=Latin}0-9 .\-_/:()+]+$/u;
// Control and format characters (zero-width, bidi, private use, unassigned, surrogates) and every
// separator but the plain space (tab, newline, no-break space, line and paragraph separators).
const FORBIDDEN_CHARACTERS = /[\p{C}\p{Zl}\p{Zp}]|(?! )\p{Zs}/u;
// A link or a domain: `://`, `www.` or a dot followed by two letters (`.com`, `.ai`). Known false
// alarm: "llama.cpp"; `gpt-4.5`, `qwen2.5-coder` and `llama3.1:8b` pass.
const ADDRESS = /:\/\/|www\.|\.\p{L}{2}/iu;

export type AgentNameResult = { ok: true; name: string | null } | { ok: false };

/**
 * The model name an agent declares about itself (unverified text, shown to the human opponent as
 * "Agent · {name} (deklarowane)"). Order of the rules: no value, `null`, an empty text or plain
 * spaces only mean "no name" (`name: null`); a non-text value is refused; then refusal of
 * forbidden characters, NFKC, trimming and collapsing of spaces, 1-40 code points, the alphabet,
 * no address. A wrong value is refused, never trimmed to something safe (decision 7): the agent
 * learns about the mistake and the invitation code is not used up.
 */
export function normalizeAgentName(input: unknown): AgentNameResult {
  if (input === undefined || input === null) return { ok: true, name: null };
  if (typeof input !== "string") return { ok: false };
  if (/^ *$/.test(input)) return { ok: true, name: null };
  // Looked at before NFKC, which turns a no-break or ideographic space into a plain one.
  if (FORBIDDEN_CHARACTERS.test(input)) return { ok: false };
  const name = input.normalize("NFKC").trim().replace(/ {2,}/g, " ");
  if (Array.from(name).length > AGENT_NAME_MAX_LENGTH) return { ok: false };
  if (!AGENT_NAME_PATTERN.test(name) || ADDRESS.test(name)) return { ok: false };
  if (!/[\p{L}0-9]/u.test(name)) return { ok: false };
  return { ok: true, name };
}
