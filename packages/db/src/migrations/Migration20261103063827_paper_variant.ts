import { Migration } from '@mikro-orm/migrations';

export class Migration20261103063827_paper_variant extends Migration {

  override name = 'Migration20261103063827_paper_variant';

  // Variant "paper and pencil" (E11): two columns in `games` and `lobby_seekers`, two new tables, the
  // CHECKs that keep the variants apart. Existing rows get `classic` / 600000 from the column defaults.
  // The generator also re-emitted older constraint rewrites and column defaults from a stale snapshot (noise removed).
  override up(): void | Promise<void> {
    this.addSql(`create table "paper_game_states" ("game_id" uuid not null, "move_count" int not null default 0, "score_1" int not null default 0, "score_2" int not null default 0, "auto_seat" smallint null, "pending_auto_at" timestamptz null, "last_move_at" timestamptz null, primary key ("game_id"));`);

    this.addSql(`create table "paper_moves" ("game_id" uuid not null, "move_number" int not null, "x" smallint not null, "y" smallint not null, "seat" smallint not null, "is_auto" boolean not null default false, "played_at" timestamptz not null, primary key ("game_id", "move_number"));`);
    this.addSql(`alter table "paper_moves" add constraint "paper_moves_game_id_x_y_unique" unique ("game_id", "x", "y");`);

    this.addSql(`alter table "games" drop constraint "games_clock_ms_check";`);
    this.addSql(`alter table "games" drop constraint "games_end_reason_check";`);
    this.addSql(`alter table "games" drop constraint "games_winner_required_check";`);
    this.addSql(`alter table "games" add "variant" varchar(16) not null default 'classic', add "time_control_ms" int not null default 600000;`);
    this.addSql(`alter table "games" add constraint "games_variant_check" check (variant in ('classic', 'paper'));`);
    this.addSql(`alter table "games" add constraint "games_time_control_check" check ((variant = 'classic' and time_control_ms = 600000) or (variant = 'paper' and time_control_ms in (60000, 120000, 180000, 300000)));`);
    this.addSql(`alter table "games" add constraint "games_paper_board_empty_check" check (variant = 'classic' or move_count = 0);`);
    this.addSql(`alter table "games" add constraint "games_classic_end_reason_check" check (end_reason is null or end_reason not in ('five_in_row', 'draw', 'timeout') or variant = 'classic');`);
    this.addSql(`alter table "games" add constraint "games_points_end_reason_check" check (end_reason is distinct from 'points' or variant = 'paper');`);
    this.addSql(`alter table "games" add constraint "games_clock_ms_check" check (clock_ms_1 between 0 and time_control_ms and clock_ms_2 between 0 and time_control_ms);`);
    this.addSql(`alter table "games" add constraint "games_end_reason_check" check (end_reason in ('five_in_row', 'draw', 'timeout', 'resignation', 'points'));`);
    this.addSql(`alter table "games" add constraint "games_winner_required_check" check (end_reason is null or end_reason in ('draw', 'points') or winner_seat is not null);`);

    this.addSql(`alter table "lobby_seekers" add "variant" varchar(16) not null default 'classic', add "time_control_ms" int not null default 600000;`);
    this.addSql(`alter table "lobby_seekers" add constraint "lobby_seekers_variant_check" check (variant in ('classic', 'paper'));`);
    this.addSql(`alter table "lobby_seekers" add constraint "lobby_seekers_time_control_check" check ((variant = 'classic' and time_control_ms = 600000) or (variant = 'paper' and time_control_ms in (60000, 120000, 180000, 300000)));`);

    this.addSql(`alter table "paper_game_states" add constraint "paper_game_states_game_id_foreign" foreign key ("game_id") references "games" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "paper_game_states" add constraint "paper_game_states_move_count_check" check (move_count >= 0);`);
    this.addSql(`alter table "paper_game_states" add constraint "paper_game_states_score_check" check (score_1 >= 0 and score_2 >= 0);`);
    this.addSql(`alter table "paper_game_states" add constraint "paper_game_states_auto_seat_check" check (auto_seat in (1, 2));`);
    this.addSql(`alter table "paper_game_states" add constraint "paper_game_states_pending_auto_check" check (pending_auto_at is null or auto_seat is not null);`);

    this.addSql(`alter table "paper_moves" add constraint "paper_moves_game_id_foreign" foreign key ("game_id") references "games" ("id") on delete cascade;`);
    this.addSql(`alter table "paper_moves" add constraint "paper_moves_move_number_check" check (move_number >= 1);`);
    this.addSql(`alter table "paper_moves" add constraint "paper_moves_coordinates_check" check (x between 0 and 100 and y between 0 and 100);`);
    this.addSql(`alter table "paper_moves" add constraint "paper_moves_seat_check" check (seat in (1, 2));`);
  }

  override down(): void | Promise<void> {
    // Refuses while a paper game exists: dropping the tables would destroy its moves and the old CHECKs could not hold.
    this.addSql(`do $$ begin if exists (select 1 from "games" where "variant" = 'paper') then raise exception 'Cannot migrate down: paper games exist, delete them first'; end if; end $$;`);

    this.addSql(`drop table if exists "paper_game_states" cascade;`);
    this.addSql(`drop table if exists "paper_moves" cascade;`);

    this.addSql(`alter table "games" drop constraint "games_variant_check";`);
    this.addSql(`alter table "games" drop constraint "games_time_control_check";`);
    this.addSql(`alter table "games" drop constraint "games_paper_board_empty_check";`);
    this.addSql(`alter table "games" drop constraint "games_classic_end_reason_check";`);
    this.addSql(`alter table "games" drop constraint "games_points_end_reason_check";`);
    this.addSql(`alter table "games" drop constraint "games_clock_ms_check";`);
    this.addSql(`alter table "games" drop constraint "games_end_reason_check";`);
    this.addSql(`alter table "games" drop constraint "games_winner_required_check";`);
    this.addSql(`alter table "games" drop column "variant", drop column "time_control_ms";`);
    this.addSql(`alter table "games" add constraint "games_clock_ms_check" check (clock_ms_1 between 0 and 600000 and clock_ms_2 between 0 and 600000);`);
    this.addSql(`alter table "games" add constraint "games_end_reason_check" check (end_reason in ('five_in_row', 'draw', 'timeout', 'resignation'));`);
    this.addSql(`alter table "games" add constraint "games_winner_required_check" check (end_reason is null or end_reason = 'draw' or winner_seat is not null);`);

    this.addSql(`alter table "lobby_seekers" drop constraint "lobby_seekers_variant_check";`);
    this.addSql(`alter table "lobby_seekers" drop constraint "lobby_seekers_time_control_check";`);
    this.addSql(`alter table "lobby_seekers" drop column "variant", drop column "time_control_ms";`);
  }

}
