import { Migration } from '@mikro-orm/migrations';

export class Migration20261031212354_game_pair_counters extends Migration {

  override name = 'Migration20261031212354_game_pair_counters';

  override up(): void | Promise<void> {
    this.addSql(`create table "game_pair_counters" ("day" date not null, "kind_a" varchar(16) not null, "kind_b" varchar(16) not null, "finished_count" int not null default 0, primary key ("day", "kind_a", "kind_b"));`);
    this.addSql(`alter table "game_pair_counters" add constraint "game_pair_counters_kind_order_check" check (kind_a <= kind_b);`);
    this.addSql(`alter table "game_pair_counters" add constraint "game_pair_counters_count_check" check (finished_count >= 0);`);

    // Backfill (E06-S03 Q3): the games that are finished and still in `games`. Exact for pairs with
    // an account; guest-guest and guest-agent games swept by the cleanup before this migration are
    // gone for good, so those two pairs start lower. Same expression as `recordFinishedGame`.
    this.addSql(`insert into "game_pair_counters" ("day", "kind_a", "kind_b", "finished_count")
      select (g.finished_at at time zone 'Europe/Warsaw')::date, k.kind_a, k.kind_b, count(*)
      from games g
      join (select game_id, min(kind) as kind_a, max(kind) as kind_b from game_players group by game_id) k
        on k.game_id = g.id
      where g.status = 'finished' and g.finished_at is not null
      group by 1, 2, 3;`);
  }

  // WARNING: drops the counters, which cannot be rebuilt for guest-guest and guest-agent games
  // already swept by the cleanup. Dump the table first: `pg_dump --data-only -t game_pair_counters`.
  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "game_pair_counters" cascade;`);
  }

}
