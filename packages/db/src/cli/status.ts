// `npm run db:status` — can the configured database be reached, and how many migrations
// are pending? Prints one JSON line; the setup installer (scripts/setup) consumes it.
import { createOrm as defaultCreateOrm, type Orm } from "../orm";
import { migrationsConfig } from "../migrations-config";

export type DatabaseErrorKind = "unreachable" | "auth" | "database-missing" | "other";

export type DatabaseStatus =
  | { ok: true; pending: number }
  | { ok: false; kind: DatabaseErrorKind; message: string };

// Node.js network errors and PostgreSQL SQLSTATE codes, as raised by the `pg` driver.
const ERROR_KINDS: Record<string, DatabaseErrorKind> = {
  ECONNREFUSED: "unreachable",
  ECONNRESET: "unreachable",
  ENOTFOUND: "unreachable",
  EAI_AGAIN: "unreachable",
  ETIMEDOUT: "unreachable",
  EHOSTUNREACH: "unreachable",
  ENETUNREACH: "unreachable",
  "57P03": "unreachable", // cannot_connect_now: the server is starting up
  "28P01": "auth", // invalid_password
  "28000": "auth", // invalid_authorization_specification
  "3D000": "database-missing", // invalid_catalog_name
};

/** Replaces the password in any connection URL inside `text` with `***`. */
export function maskSecrets(text: string): string {
  return text.replace(/(\w+:\/\/[^:/@\s]+:)[^@\s]+@/g, "$1***@");
}

export function classifyError(error: unknown): { kind: DatabaseErrorKind; message: string } {
  const code = (error as { code?: unknown } | null)?.code;
  const kind = (typeof code === "string" && ERROR_KINDS[code]) || "other";
  const message = error instanceof Error ? error.message : String(error);
  return { kind, message: maskSecrets(message) };
}

export async function getDatabaseStatus(
  createOrm: (overrides: Parameters<typeof defaultCreateOrm>[0]) => Promise<Orm> = defaultCreateOrm,
): Promise<DatabaseStatus> {
  let orm: Orm | undefined;
  try {
    // ensureDatabase: false — a probe must never create the database (MikroORM 7
    // defaults it to true and would silently create a missing one on connect).
    orm = await createOrm({ ...migrationsConfig, ensureDatabase: false, pool: { min: 0, max: 1 } });
    await orm.em.getConnection().execute("select 1");
    const pending = await orm.migrator.getPending();
    return { ok: true, pending: pending.length };
  } catch (error) {
    return { ok: false, ...classifyError(error) };
  } finally {
    await orm?.close();
  }
}
