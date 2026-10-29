import { TooManyRequestsError } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

type Deps = { em: EntityManager };

type BucketRow = { count: number; retry_after_seconds: number };

// Fixed window kept entirely in SQL, so concurrent requests cannot lose an increment:
// one upsert either opens a new window (the old one elapsed) or bumps the counter.
// Database time (`now()`) is used throughout, so app-server clock skew does not matter.
// `em.execute` joins the surrounding transaction (a bare connection would not). All values are bound parameters; nothing from the caller is interpolated.
const CONSUME_SQL = `
  insert into rate_limit_buckets as b ("key", window_start, "count")
  values (?, now(), 1)
  on conflict ("key") do update set
    window_start = case when b.window_start + (?::double precision * interval '1 millisecond') <= now()
      then now() else b.window_start end,
    "count" = case when b.window_start + (?::double precision * interval '1 millisecond') <= now()
      then 1 else b."count" + 1 end
  returning "count",
    greatest(1, ceil(extract(epoch from
      (b.window_start + (?::double precision * interval '1 millisecond') - now()))))::int
      as retry_after_seconds`;

// Read-only peek at a live bucket (no row when the window elapsed or the key is new).
const PEEK_SQL = `
  select "count",
    greatest(1, ceil(extract(epoch from
      (window_start + (?::double precision * interval '1 millisecond') - now()))))::int
      as retry_after_seconds
  from rate_limit_buckets
  where "key" = ?
    and window_start + (?::double precision * interval '1 millisecond') > now()`;

const RESET_SQL = `delete from rate_limit_buckets where "key" = ?`;

export class RateLimiter {
  readonly #em: EntityManager;

  constructor({ em }: Deps) {
    this.#em = em;
  }

  /**
   * Counts one attempt for `key` and throws `TooManyRequestsError` once `limit` attempts per
   * `windowMs` are exceeded. The counter is written in its own, immediately committed
   * transaction, so it survives a later rollback of the caller's work. Returns the counter
   * state (`count`, `retryAfterSeconds` until the window ends) when the attempt is allowed.
   */
  async hit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<{ count: number; retryAfterSeconds: number }> {
    const rows = await this.#em.transactional((em) =>
      em.execute<BucketRow[]>(
        CONSUME_SQL,
        [key, windowMs, windowMs, windowMs],
        "all",
      ),
    );
    const row = rows[0] as BucketRow;
    if (row.count > limit) {
      throw new TooManyRequestsError(
        "Zbyt wiele prób. Spróbuj ponownie później.",
        {
          retryAfterSeconds: row.retry_after_seconds,
        },
      );
    }
    return { count: row.count, retryAfterSeconds: row.retry_after_seconds };
  }

  /**
   * Refuses (429) when `limit` attempts were already counted for `key` in the current window,
   * without counting anything. For pools that only failures feed (e.g. failed invitation-code
   * lookups): once spent, even a correct attempt is refused, so the answer is no oracle.
   */
  async assertBelow(key: string, limit: number, windowMs: number): Promise<void> {
    const rows = await this.#em.execute<BucketRow[]>(
      PEEK_SQL,
      [windowMs, key, windowMs],
      "all",
    );
    const row = rows[0];
    if (row && row.count >= limit) {
      throw new TooManyRequestsError(
        "Zbyt wiele prób. Spróbuj ponownie później.",
        { retryAfterSeconds: row.retry_after_seconds },
      );
    }
  }

  /** Same as {@link hit}, for callers that only need the limit enforced. */
  async consume(key: string, limit: number, windowMs: number): Promise<void> {
    await this.hit(key, limit, windowMs);
  }

  /** Forgets the counter for `key` (own committed transaction), e.g. after a successful login. */
  async reset(key: string): Promise<void> {
    await this.#em.transactional((em) => em.execute(RESET_SQL, [key], "run"));
  }
}
