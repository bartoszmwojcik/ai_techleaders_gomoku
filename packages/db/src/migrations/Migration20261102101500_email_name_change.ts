import { Migration } from '@mikro-orm/migrations';

export class Migration20261102101500_email_name_change extends Migration {

  override name = 'Migration20261102101500_email_name_change';

  override up(): void | Promise<void> {
    this.addSql(`create table "email_change_tokens" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "new_email" varchar(254) not null, "token_hash" char(64) not null, "created_at" timestamptz not null default now(), "expires_at" timestamptz not null, "used_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "email_change_tokens_user_id_index" on "email_change_tokens" ("user_id");`);
    this.addSql(`alter table "email_change_tokens" add constraint "email_change_tokens_token_hash_unique" unique ("token_hash");`);
    this.addSql(`alter table "email_change_tokens" add constraint "email_change_tokens_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);

    this.addSql(`alter table "users" add "display_name_changed_at" timestamptz null;`);

    this.addSql(`alter table "game_players" add "display_name" varchar(24) null;`);
    // Back-fill: every existing account seat keeps the name its owner has today (a deleted account stays NULL).
    this.addSql(`update "game_players" p set "display_name" = u."display_name" from "users" u where p."user_id" = u."id" and p."kind" = 'account';`);
    this.addSql(`alter table "game_players" add constraint "game_players_display_name_only_account_check" check (kind = 'account' or display_name is null);`);
  }

  override down(): void | Promise<void> {
    // WARNING: drops the pending e-mail changes, the name snapshots of past games and the 24 h name-change window.
    this.addSql(`alter table "game_players" drop constraint "game_players_display_name_only_account_check";`);
    this.addSql(`alter table "game_players" drop column "display_name";`);

    this.addSql(`alter table "users" drop column "display_name_changed_at";`);

    this.addSql(`drop table if exists "email_change_tokens" cascade;`);
  }

}
