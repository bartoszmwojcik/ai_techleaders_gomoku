import { Migration } from '@mikro-orm/migrations';

export class Migration20261102205023_game_spectators extends Migration {

  override name = 'Migration20261102205023_game_spectators';

  // Only the new table: the snapshot was stale and the generator also re-emitted older changes (noise removed).
  override up(): void | Promise<void> {
    this.addSql(`create table "game_spectators" ("id" uuid not null default gen_random_uuid(), "game_id" uuid not null, "user_id" uuid null, "nickname" varchar(24) null, "token_hash" char(64) null, "created_at" timestamptz not null default now(), "last_seen_at" timestamptz not null default now(), "expires_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "game_spectators" add constraint "game_spectators_token_hash_unique" unique ("token_hash");`);
    this.addSql(`create index "game_spectators_expires_at_index" on "game_spectators" ("expires_at");`);
    this.addSql(`create index "game_spectators_game_id_last_seen_at_index" on "game_spectators" ("game_id", "last_seen_at");`);
    this.addSql(`create index "game_spectators_user_id_index" on "game_spectators" ("user_id");`);
    this.addSql(`alter table "game_spectators" add constraint "game_spectators_game_id_user_id_unique" unique ("game_id", "user_id");`);

    this.addSql(`alter table "game_spectators" add constraint "game_spectators_game_id_foreign" foreign key ("game_id") references "games" ("id") on delete cascade;`);
    this.addSql(`alter table "game_spectators" add constraint "game_spectators_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
    this.addSql(`alter table "game_spectators" add constraint "game_spectators_identity_check" check ((user_id is not null) <> (token_hash is not null));`);
    this.addSql(`alter table "game_spectators" add constraint "game_spectators_nickname_check" check (nickname is null or (token_hash is not null and char_length(nickname) between 1 and 24));`);
    this.addSql(`alter table "game_spectators" add constraint "game_spectators_expiry_check" check (expires_at > created_at);`);

  }

  override down(): void | Promise<void> {
    // WARNING: drops every spectator row with the table; they are temporary by design (BR-39).
    this.addSql(`drop table if exists "game_spectators" cascade;`);
  }

}
