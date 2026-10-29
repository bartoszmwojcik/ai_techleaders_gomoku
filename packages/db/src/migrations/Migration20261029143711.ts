import { Migration } from '@mikro-orm/migrations';

export class Migration20261029143711 extends Migration {

  override name = 'Migration20261029143711';

  override up(): void | Promise<void> {
    this.addSql(`create table "games" ("id" uuid not null default gen_random_uuid(), "origin" varchar(16) not null, "status" varchar(16) not null, "created_at" timestamptz not null default now(), "started_at" timestamptz null, "finished_at" timestamptz null, "clock_ms_1" int not null default 600000, "clock_ms_2" int not null default 600000, "turn_started_at" timestamptz null, "rematch_offered_by_seat" smallint null, "rematch_expires_at" timestamptz null, "rematch_state" varchar(16) null, "rematch_game_id" uuid null, primary key ("id"));`);
    this.addSql(`create index "games_status_created_at_index" on "games" ("status", "created_at");`);

    this.addSql(`create table "game_players" ("id" uuid not null default gen_random_uuid(), "game_id" uuid not null, "seat" smallint not null, "kind" varchar(16) not null, "user_id" uuid null, "guest_token_hash" char(64) null, "is_active" boolean not null default false, "joined_at" timestamptz not null default now(), "seen_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "game_players" add constraint "game_players_guest_token_hash_unique" unique ("guest_token_hash");`);
    this.addSql(`alter table "game_players" add constraint "game_players_game_id_seat_unique" unique ("game_id", "seat");`);
    this.addSql(`alter table "game_players" add constraint "game_players_game_id_user_id_unique" unique ("game_id", "user_id");`);
    this.addSql(`create unique index "game_players_user_id_active_unique" on "game_players" ("user_id") where is_active;`);

    this.addSql(`create table "invitations" ("id" uuid not null default gen_random_uuid(), "game_id" uuid not null, "code" varchar(8) not null, "created_at" timestamptz not null default now(), "expires_at" timestamptz not null, "consumed_at" timestamptz null, "consumed_by_id" uuid null, primary key ("id"));`);
    this.addSql(`alter table "invitations" add constraint "invitations_game_id_unique" unique ("game_id");`);
    this.addSql(`alter table "invitations" add constraint "invitations_code_unique" unique ("code");`);
    this.addSql(`create index "invitations_expires_at_index" on "invitations" ("expires_at");`);

    this.addSql(`alter table "games" add constraint "games_rematch_game_id_foreign" foreign key ("rematch_game_id") references "games" ("id") on delete set null;`);
    this.addSql(`alter table "games" add constraint "games_origin_check" check (origin in ('invite', 'lobby', 'rematch'));`);
    this.addSql(`alter table "games" add constraint "games_status_check" check (status in ('waiting', 'active', 'finished', 'cancelled'));`);
    this.addSql(`alter table "games" add constraint "games_started_at_check" check (status not in ('active', 'finished') or started_at is not null);`);
    this.addSql(`alter table "games" add constraint "games_finished_at_check" check (status <> 'finished' or finished_at is not null);`);
    this.addSql(`alter table "games" add constraint "games_clock_ms_check" check (clock_ms_1 between 0 and 600000 and clock_ms_2 between 0 and 600000);`);
    this.addSql(`alter table "games" add constraint "games_rematch_offered_by_seat_check" check (rematch_offered_by_seat in (1, 2));`);
    this.addSql(`alter table "games" add constraint "games_rematch_state_check" check (rematch_state in ('pending', 'accepted', 'declined'));`);
    this.addSql(`alter table "games" add constraint "games_rematch_only_finished_check" check (rematch_state is null or status = 'finished');`);
    this.addSql(`alter table "games" add constraint "games_rematch_pending_check" check (rematch_state is distinct from 'pending' or (rematch_offered_by_seat is not null and rematch_expires_at is not null));`);

    this.addSql(`alter table "game_players" add constraint "game_players_game_id_foreign" foreign key ("game_id") references "games" ("id") on delete cascade;`);
    this.addSql(`alter table "game_players" add constraint "game_players_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete set null;`);
    this.addSql(`alter table "game_players" add constraint "game_players_seat_check" check (seat in (1, 2));`);
    this.addSql(`alter table "game_players" add constraint "game_players_kind_check" check (kind in ('account', 'guest'));`);
    this.addSql(`alter table "game_players" add constraint "game_players_guest_no_user_check" check (kind <> 'guest' or user_id is null);`);
    this.addSql(`alter table "game_players" add constraint "game_players_token_only_guest_check" check (kind = 'guest' or guest_token_hash is null);`);

    this.addSql(`alter table "invitations" add constraint "invitations_game_id_foreign" foreign key ("game_id") references "games" ("id") on delete cascade;`);
    this.addSql(`alter table "invitations" add constraint "invitations_consumed_by_id_foreign" foreign key ("consumed_by_id") references "game_players" ("id") on delete set null;`);
    this.addSql(`alter table "invitations" add constraint "invitations_code_check" check (code ~ '^[2-9A-HJKMNP-Z]{8}\$');`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "games" drop constraint "games_rematch_game_id_foreign";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_game_id_foreign";`);
    this.addSql(`alter table "invitations" drop constraint "invitations_game_id_foreign";`);
    this.addSql(`alter table "invitations" drop constraint "invitations_consumed_by_id_foreign";`);

    this.addSql(`drop table if exists "games" cascade;`);
    this.addSql(`drop table if exists "game_players" cascade;`);
    this.addSql(`drop table if exists "invitations" cascade;`);
  }

}
