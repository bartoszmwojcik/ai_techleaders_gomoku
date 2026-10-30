import { Migration } from '@mikro-orm/migrations';

export class Migration20261030133534_nickname extends Migration {

  override name = 'Migration20261030133534_nickname';

  override up(): void | Promise<void> {
    this.addSql(`alter table "game_players" add "nickname" varchar(24) null;`);
    this.addSql(`alter table "game_players" add constraint "game_players_nickname_not_empty_check" check (nickname is null or char_length(nickname) >= 1);`);
    this.addSql(`alter table "game_players" add constraint "game_players_nickname_only_guest_check" check (kind = 'guest' or nickname is null);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "game_players" drop constraint "game_players_nickname_not_empty_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_nickname_only_guest_check";`);
    this.addSql(`alter table "game_players" drop column "nickname";`);
  }

}
