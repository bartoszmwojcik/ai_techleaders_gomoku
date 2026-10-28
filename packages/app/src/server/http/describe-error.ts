/**
 * What may be logged about an unknown error: its class name and driver code (e.g. the
 * PostgreSQL SQLSTATE), never the message or the object itself. Database errors carry the
 * formatted query, which contains the e-mail address of the request (PII).
 */
export function describeError(error: unknown): { name: string; code?: string } {
  if (!(error instanceof Error)) return { name: typeof error };
  const { code } = error as { code?: unknown };
  return typeof code === "string" || typeof code === "number"
    ? { name: error.name, code: String(code) }
    : { name: error.name };
}
