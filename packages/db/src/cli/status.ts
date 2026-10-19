// `npm run db:status` — can the configured database be reached, and how many migrations
// are pending? Prints one JSON line; the setup installer (scripts/setup) consumes it.
// Side effect: creates the empty `mikro_orm_migrations` table when missing (see below).
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
  "57P01": "unreachable", // admin_shutdown: e.g. the temporary init server stopping
  "57P03": "unreachable", // cannot_connect_now: the server is starting up
  "28P01": "auth", // invalid_password
  "28000": "auth", // invalid_authorization_specification
  "3D000": "database-missing", // invalid_catalog_name
};

/**
 * Hides passwords in connection strings inside `text`: the userinfo password of any URL
 * (greedy up to the last `@` of the authority, so an unencoded `@` in the password does
 * not leak the rest; an empty user name is covered too) and `password=` query parameters.
 * Kept identical to maskSecrets in scripts/setup/env.mjs (a test compares them).
 * Known limit: a password containing an unencoded "/" is not a valid URL (WHATWG `URL`
 * rejects it) and is not masked.
 */
export function maskSecrets(text: string): string {
  return text.replace(/(\w+:\/\/[^:/@\s]*:)[^\s/]*@/g, "$1***@").replace(/([?&]password=)[^&\s]+/gi, "$1***");
}

// `pg` raises these without a code. Right after `docker compose up`, Docker's port proxy
// accepts the TCP connection and closes it while PostgreSQL inside is still starting —
// a transient state the setup installer must wait out, not a configuration error.
const UNREACHABLE_MESSAGE = /^Connection terminated (unexpectedly|due to connection timeout)/;

export function classifyError(error: unknown): { kind: DatabaseErrorKind; message: string } {
  const code = (error as { code?: unknown } | null)?.code;
  const message = describe(error);
  const kind = (typeof code === "string" && ERROR_KINDS[code]) || (UNREACHABLE_MESSAGE.test(message) ? "unreachable" : "other");
  return { kind, message: maskSecrets(message) };
}

function describe(error: unknown): string {
  // A host resolving to IPv4 and IPv6 fails with an AggregateError whose own message is empty.
  if (error instanceof AggregateError && !error.message) return error.errors.map(describe).join("; ");
  return error instanceof Error ? error.message : String(error);
}

export async function getDatabaseStatus(
  createOrm: (overrides: Parameters<typeof defaultCreateOrm>[0]) => Promise<Orm> = defaultCreateOrm,
): Promise<DatabaseStatus> {
  let orm: Orm | undefined;
  try {
    // ensureDatabase: false — a probe must never create the database (MikroORM 7
    // defaults it to true and would silently create a missing one on connect).
    orm = await createOrm({ ...migrationsConfig, ensureDatabase: false, pool: { min: 0, max: 1 } });
    // `select 1` writes nothing. Counting pending migrations initializes the migrator,
    // which creates the `mikro_orm_migrations` table when it is missing — the same table
    // `db:migration:up` creates. The setup installer calls this only for the database it
    // has confirmed as the target (step "Cel bazy").
    await orm.em.getConnection().execute("select 1");
    const pending = await orm.migrator.getPending();
    return { ok: true, pending: pending.length };
  } catch (error) {
    return { ok: false, ...classifyError(error) };
  } finally {
    await orm?.close();
  }
}
