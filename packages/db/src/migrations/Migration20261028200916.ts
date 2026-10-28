import { Migration } from '@mikro-orm/migrations';

export class Migration20261028200916 extends Migration {

  override name = 'Migration20261028200916';

  override up(): void | Promise<void> {
    this.addSql(`create table "password_reset_tokens" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "token_hash" char(64) not null, "created_at" timestamptz not null default now(), "expires_at" timestamptz not null, "used_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "password_reset_tokens_user_id_index" on "password_reset_tokens" ("user_id");`);
    this.addSql(`alter table "password_reset_tokens" add constraint "password_reset_tokens_token_hash_unique" unique ("token_hash");`);

    this.addSql(`alter table "password_reset_tokens" add constraint "password_reset_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "password_reset_tokens" cascade;`);
  }

}
