// Logic of `npm run db:cleanup` (entry point: ../cli/cleanup-cli.ts). Prints the result of
// `cleanupExpired` as one JSON line; when some rules failed it still prints that line (progress of the
// other rules) and reports the failed rules (names and codes only) on stderr with exit code 1; on a
// total failure prints a masked message to stderr and returns 1 so cron (or `docker exec`) can report
// it. The ORM is always closed.
import { classifyError } from "../cli/status";
import { createOrm as defaultCreateOrm, type Orm } from "../orm";
import { cleanupExpired } from "./cleanup-expired";

export type CleanupRunDeps = {
  createOrm?: (overrides: Parameters<typeof defaultCreateOrm>[0]) => Promise<Orm>;
  now?: () => Date;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
};

export async function runCleanup({
  createOrm = defaultCreateOrm,
  now = () => new Date(),
  stdout = process.stdout,
  stderr = process.stderr,
}: CleanupRunDeps = {}): Promise<number> {
  let orm: Orm | undefined;
  try {
    // ensureDatabase: false — a maintenance job must never create a missing database.
    orm = await createOrm({ ensureDatabase: false, pool: { min: 0, max: 1 } });
    const result = await cleanupExpired({ em: orm.em.fork(), now: now() });
    stdout.write(`${JSON.stringify(result)}\n`);
    if (result.errors.length === 0) return 0;
    stderr.write(`${JSON.stringify({ ok: false, errors: result.errors })}\n`);
    return 1;
  } catch (error) {
    // Only the masked driver message: never the connection string or row values.
    stderr.write(`${JSON.stringify({ ok: false, error: classifyError(error).message })}\n`);
    return 1;
  } finally {
    await orm?.close();
  }
}
