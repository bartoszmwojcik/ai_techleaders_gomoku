import { Migration } from '@mikro-orm/migrations';

export class Migration20261102212952_spectator_chat extends Migration {

  override name = 'Migration20261102212952_spectator_chat';

  // Only the chat change: the generated `games`, `game_players` and `game_spectators` statements were snapshot noise.
  override up(): void | Promise<void> {
    this.addSql(`alter table "chat_messages" add "spectator_id" uuid null, add "author_name" varchar(24) null;`);
    this.addSql(`alter table "chat_messages" alter column "sender_id" drop not null;`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_spectator_id_foreign" foreign key ("spectator_id") references "game_spectators" ("id") on delete cascade;`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_spectator_id_client_id_unique" unique ("spectator_id", "client_id");`);
    this.addSql(`alter table "chat_messages" add constraint "chat_messages_author_check" check ((sender_id is not null and spectator_id is null and author_name is null) or (sender_id is null and spectator_id is not null and author_name is not null));`);
  }

  override down(): void | Promise<void> {
    // WARNING: deletes the spectators' messages (a row without a seat cannot stay once `sender_id` is NOT NULL again); they are temporary by design (BR-34).
    this.addSql(`delete from "chat_messages" where "sender_id" is null;`);
    this.addSql(`alter table "chat_messages" drop constraint "chat_messages_author_check";`);
    this.addSql(`alter table "chat_messages" drop constraint "chat_messages_spectator_id_client_id_unique";`);
    this.addSql(`alter table "chat_messages" drop constraint "chat_messages_spectator_id_foreign";`);
    this.addSql(`alter table "chat_messages" drop column "spectator_id", drop column "author_name";`);
    this.addSql(`alter table "chat_messages" alter column "sender_id" set not null;`);
  }

}
