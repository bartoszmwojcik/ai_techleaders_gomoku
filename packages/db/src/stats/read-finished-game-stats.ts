import {
  buildFinishedGameStats,
  type FinishedGameStats,
  type PairCounterRow,
} from "@gomoku/core";

import type { EntityManager } from "../orm";

// Read only. The windows are computed in SQL from `now` in Europe/Warsaw (lesson: dates come
// back from `em.execute` as text, so they are never compared in JS); `today` is that day and
// "7 days" is today and the 6 days before it.
const STATS_SQL = `
  select c.kind_a, c.kind_b,
    sum(c.finished_count)::int as total,
    coalesce(sum(c.finished_count) filter (where c.day = t.today), 0)::int as today,
    coalesce(sum(c.finished_count) filter (where c.day between t.today - 6 and t.today), 0)::int as last7_days
  from game_pair_counters c
  cross join (select (?::timestamptz at time zone 'Europe/Warsaw')::date as today) t
  group by c.kind_a, c.kind_b`;

/**
 * The finished games per pair of participant kinds (E06-S03). The one source for the
 * `stats:games` command and for the admin panel.
 */
export async function readFinishedGameStats(
  em: Pick<EntityManager, "execute">,
  now: Date,
): Promise<FinishedGameStats> {
  const rows = await em.execute<PairCounterRow[]>(STATS_SQL, [now]);
  return buildFinishedGameStats(rows);
}
