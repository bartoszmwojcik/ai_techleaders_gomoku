import { Migration } from '@mikro-orm/migrations';

export class Migration20261101084423_chat_messages extends Migration {

  override name = 'Migration20261101084423_chat_messages';

  // Only the new schema: the generated `games` defaults and the agent-name check were snapshot noise.
  override up(): void | Promise<void> {
    this.addSql(`create table "chat_messages" ("id" uuid not null default gen_random_uuid(), "game_id" uuid not null, "seq" int not null, "sender_id" uuid not null, "client_id" uuid not null, "body" varchar(1000) not null, "created_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_game_id_seq_unique" unique ("game_id", "seq");`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_sender_id_client_id_unique" unique ("sender_id", "client_id");`);

    this.addSql(`alter table "game_players" add "chat_enabled" boolean not null default true;`);

    this.addSql(`alter table "chat_messages" add constraint "chat_messages_game_id_foreign" foreign key ("game_id") references "games" ("id") on delete cascade;`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_sender_id_foreign" foreign key ("sender_id") references "game_players" ("id") on delete cascade;`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_seq_check" check (seq >= 1);`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_body_length_check" check (char_length(body) between 1 and 1000);`);
  }

  override down(): void | Promise<void> {
    // WARNING: drops the chat messages with the table; they are temporary by design (BR-34).
    this.addSql(`drop table if exists "chat_messages" cascade;`);

    this.addSql(`alter table "game_players" drop column "chat_enabled";`);

  }

}
