import { Migration } from '@mikro-orm/migrations';

export class Migration20261027173339 extends Migration {

  override name = 'Migration20261027173339';

  override up(): void | Promise<void> {
    this.addSql(`create table "rate_limit_buckets" ("key" varchar(200) not null, "window_start" timestamptz not null, "count" int not null, primary key ("key"));`);

    this.addSql(`create table "users" ("id" uuid not null default gen_random_uuid(), "email" varchar(254) not null, "display_name" varchar(24) not null, "display_name_key" varchar(24) not null, "password_hash" varchar(60) not null, "email_verified_at" timestamptz null, "created_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);
    this.addSql(`alter table "users" add constraint "users_display_name_key_unique" unique ("display_name_key");`);

    this.addSql(`create table "sessions" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "token_hash" char(64) not null, "created_at" timestamptz not null default now(), "expires_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "sessions_user_id_index" on "sessions" ("user_id");`);
    this.addSql(`alter table "sessions" add constraint "sessions_token_hash_unique" unique ("token_hash");`);

    this.addSql(`alter table "sessions" add constraint "sessions_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "sessions" cascade;`);
    this.addSql(`drop table if exists "users" cascade;`);
    this.addSql(`drop table if exists "rate_limit_buckets" cascade;`);
  }

}
