/** Time zone of the counter's day (E06-S03 Q2): "today" for the owner and the admin panel. */
export const FINISHED_STATS_TIME_ZONE = "Europe/Warsaw";

/**
 * The five pairs of participant kinds a game can have, in display order. Each is in the
 * canonical alphabetical order the counter stores. An agent never plays another agent (BR-30).
 */
export const KNOWN_PAIRS: readonly (readonly [string, string])[] = [
  ["account", "account"],
  ["account", "guest"],
  ["account", "agent"],
  ["guest", "guest"],
  ["agent", "guest"],
];

export type PairCounter = {
  /** `"<kind_a>-<kind_b>"`, e.g. `account-agent`; "agent" means "joined over MCP". */
  pair: string;
  kinds: [string, string];
  total: number;
  /** The current day in `Europe/Warsaw`. */
  today: number;
  /** Today and the 6 days before. */
  last7Days: number;
};

export type FinishedGameStats = {
  timeZone: typeof FINISHED_STATS_TIME_ZONE;
  total: number;
  today: number;
  last7Days: number;
  /** The five known pairs always (zeros included), then unknown ones alphabetically. */
  pairs: PairCounter[];
};

/** One aggregated row as the database returns it (sums may arrive as numeric strings). */
export type PairCounterRow = {
  kind_a: string;
  kind_b: string;
  total: number | string;
  today: number | string;
  last7_days: number | string;
};

const pairKey = (a: string, b: string) => `${a}-${b}`;

/** Shapes the aggregated rows into the stats the CLI and the admin panel both show. */
export function buildFinishedGameStats(rows: readonly PairCounterRow[]): FinishedGameStats {
  const byPair = new Map<string, PairCounter>();
  for (const row of rows) {
    byPair.set(pairKey(row.kind_a, row.kind_b), {
      pair: pairKey(row.kind_a, row.kind_b),
      kinds: [row.kind_a, row.kind_b],
      total: Number(row.total),
      today: Number(row.today),
      last7Days: Number(row.last7_days),
    });
  }
  const known = KNOWN_PAIRS.map(
    ([a, b]): PairCounter =>
      byPair.get(pairKey(a, b)) ?? { pair: pairKey(a, b), kinds: [a, b], total: 0, today: 0, last7Days: 0 },
  );
  const knownKeys = new Set(known.map(({ pair }) => pair));
  const unknown = [...byPair.values()]
    .filter(({ pair }) => !knownKeys.has(pair))
    .sort((left, right) => left.pair.localeCompare(right.pair));
  const pairs = [...known, ...unknown];
  const sum = (pick: (counter: PairCounter) => number) =>
    pairs.reduce((all, counter) => all + pick(counter), 0);
  return {
    timeZone: FINISHED_STATS_TIME_ZONE,
    total: sum((c) => c.total),
    today: sum((c) => c.today),
    last7Days: sum((c) => c.last7Days),
    pairs,
  };
}
