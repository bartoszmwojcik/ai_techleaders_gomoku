// Logic of `npm run db:cleanup` (entry point: ../cli/cleanup-cli.ts). Prints the result of
// `cleanupExpired` as one JSON line; on failure prints a masked message to stderr and
// returns exit code 1 so cron (or `docker exec`) can report it. The ORM is always closed.
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
    return 0;
  } catch (error) {
    // Only the masked driver message: never the connection string or row values.
    stderr.write(`${JSON.stringify({ ok: false, error: classifyError(error).message })}\n`);
    return 1;
  } finally {
    await orm?.close();
  }
}
