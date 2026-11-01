import type { EntityManager } from "@gomoku/db";

// One statement: the pair of participant kinds (canonical alphabetical order) and the day in
// Europe/Warsaw come from the rows themselves. `g.status = 'finished'` makes a wrong call a
// no-op instead of a wrong count.
const RECORD_SQL = `
  insert into game_pair_counters (day, kind_a, kind_b, finished_count)
  select (g.finished_at at time zone 'Europe/Warsaw')::date, k.kind_a, k.kind_b, 1
  from games g
  join (
    select game_id, min(kind) as kind_a, max(kind) as kind_b
    from game_players where game_id = ? group by game_id
  ) k on k.game_id = g.id
  where g.id = ? and g.status = 'finished'
  on conflict (day, kind_a, kind_b)
  do update set finished_count = game_pair_counters.finished_count + 1`;

/**
 * Counts a finished game in the durable per-pair counter (E06-S03). Call it right after the
 * `UPDATE ... where status = 'active'` that returned a row, in the same transaction and only
 * through its `tx`: then the count is +1 exactly once and rolls back with the finish.
 */
export async function recordFinishedGame(tx: EntityManager, gameId: string): Promise<void> {
  await tx.execute(RECORD_SQL, [gameId, gameId], "run");
}
