import { Migration } from '@mikro-orm/migrations';

export class Migration20261031114543 extends Migration {

  override name = 'Migration20261031114543';

  override up(): void | Promise<void> {
    this.addSql(`create table "lobby_seekers" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "created_at" timestamptz not null default now(), "expires_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "lobby_seekers" add constraint "lobby_seekers_user_id_unique" unique ("user_id");`);
    this.addSql(`create index "lobby_seekers_expires_at_index" on "lobby_seekers" ("expires_at");`);
    this.addSql(`alter table "lobby_seekers" add constraint "lobby_seekers_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
    this.addSql(`alter table "lobby_seekers" add constraint "lobby_seekers_expiry_check" check (expires_at > created_at);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "lobby_seekers" cascade;`);
  }

}
