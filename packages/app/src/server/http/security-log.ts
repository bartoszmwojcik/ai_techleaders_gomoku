/**
 * Security event log (OWASP A09:2025, T-01/T-09/T-13): one JSON line per event on stderr via
 * `console.warn`, greppable in `docker logs` (`grep '"event":"security.'`). The codes are stable
 * (they are an interface for the operator's `grep`); the details are deliberately limited to a
 * short `scope` (the name of a limiter or of a gate, never a key with a hash of an identifier)
 * and a `reason`. NEVER pass an e-mail, an address, a token, a nickname or a user agent here:
 * the type allows no other fields, and callers pass fixed strings only.
 */
export type SecurityEventCode =
  | "rate_limited"
  | "csrf_rejected"
  | "admin_denied"
  | "login_failed"
  | "invitation_lookup_failed"
  | "mcp_token_invalid";

export type SecurityEventDetails = { scope?: string; reason?: string };

export function logSecurityEvent(code: SecurityEventCode, details: SecurityEventDetails = {}): void {
  console.warn(JSON.stringify({ event: `security.${code}`, ts: new Date().toISOString(), ...details }));
}

// The second segment of a limiter key that names a kind of subject; any other second segment may be
// an identifier (`lobby-mark:<userId>`) and is dropped.
const SAFE_KIND = new Set(["ip", "global", "email", "email-ip", "user", "address"]);

/** The name of a rate-limit pool from its key (`login:ip:<hash>` gives `login:ip`), without identifiers. */
export function limiterScope(key: string): string {
  const [name = "", kind] = key.split(":");
  return kind !== undefined && SAFE_KIND.has(kind) ? `${name}:${kind}` : name;
}
