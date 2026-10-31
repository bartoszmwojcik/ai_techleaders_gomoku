// Logic of `npm run db:stats:games` / `stats:games` (entry point: ../cli/stats-cli.ts). Read only:
// prints the finished-game stats as one JSON line and returns 0, or prints a masked message to
// stderr and returns 1. The ORM is always closed.
import { classifyError } from "../cli/status";
import { createOrm as defaultCreateOrm, type Orm } from "../orm";
import { readFinishedGameStats } from "./read-finished-game-stats";

export type StatsRunDeps = {
  createOrm?: (overrides: Parameters<typeof defaultCreateOrm>[0]) => Promise<Orm>;
  now?: () => Date;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
};

export async function runStats({
  createOrm = defaultCreateOrm,
  now = () => new Date(),
  stdout = process.stdout,
  stderr = process.stderr,
}: StatsRunDeps = {}): Promise<number> {
  let orm: Orm | undefined;
  try {
    // ensureDatabase: false — a read must never create a missing database.
    orm = await createOrm({ ensureDatabase: false, pool: { min: 0, max: 1 } });
    stdout.write(`${JSON.stringify(await readFinishedGameStats(orm.em.fork(), now()))}\n`);
    return 0;
  } catch (error) {
    // Only the masked driver message: never the connection string.
    stderr.write(`${JSON.stringify({ ok: false, error: classifyError(error).message })}\n`);
    return 1;
  } finally {
    await orm?.close();
  }
}
