const FALLBACK_PATH = "/";

// Control characters and spaces (browsers strip tabs/newlines, so "/\t/evil.com" would become "//evil.com")
// and backslashes (treated as "/" by browsers) are never allowed.
const FORBIDDEN_CHARS = /[\u0000- \u007f\\]/;

/**
 * Validates a post-auth return path against open redirects (G8).
 * Accepts only same-origin relative paths starting with a single "/";
 * anything else (missing, empty, "//host", "/\host", schemes) falls back to "/".
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return FALLBACK_PATH;
  if (!value.startsWith("/") || value.startsWith("//")) return FALLBACK_PATH;
  if (FORBIDDEN_CHARS.test(value)) return FALLBACK_PATH;
  return value;
}
