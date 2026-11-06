import { Migration } from '@mikro-orm/migrations';

export class Migration20261106071117_bot_participant extends Migration {

  override name = 'Migration20261106071117_bot_participant';

  override up(): void | Promise<void> {
    this.addSql(`alter table "games" drop constraint "games_origin_check";`);
    this.addSql(`alter table "games" add constraint "games_origin_check" check (origin in ('invite', 'lobby', 'rematch', 'bot'));`);

    this.addSql(`alter table "game_players" drop constraint "game_players_kind_check";`);
    this.addSql(`alter table "game_players" add "bot_level" smallint null, add "bot_memory_mb" smallint null, add "bot_depth_cap" smallint null;`);
    this.addSql(`create index "game_players_bot_active_index" on "game_players" ("game_id") where kind = 'bot' and is_active;`);
    this.addSql(`alter table "game_players" add constraint "game_players_bot_level_check" check (bot_level is null or bot_level in (1, 2));`);
    this.addSql(`alter table "game_players" add constraint "game_players_bot_kind_check" check ((kind = 'bot') = (bot_level is not null));`);
    this.addSql(`alter table "game_players" add constraint "game_players_bot_params_check" check ((bot_level is distinct from 2 or (bot_memory_mb is not null and bot_depth_cap is not null)) and (bot_level = 2 or (bot_memory_mb is null and bot_depth_cap is null)));`);
    this.addSql(`alter table "game_players" add constraint "game_players_bot_no_user_check" check (kind <> 'bot' or user_id is null);`);
    this.addSql(`alter table "game_players" add constraint "game_players_bot_seat_check" check (kind <> 'bot' or seat = 2);`);
    this.addSql(`alter table "game_players" add constraint "game_players_kind_check" check (kind in ('account', 'guest', 'agent', 'bot'));`);
  }

  override async down(): Promise<void> {
    // Dropping the kind would leave rows that violate the old CHECKs: refuse instead of losing data.
    const bots = await this.execute(`select 1 from "game_players" where "kind" = 'bot' limit 1`);
    const botGames = await this.execute(`select 1 from "games" where "origin" = 'bot' limit 1`);
    if (bots.length > 0 || botGames.length > 0) {
      throw new Error(
        "Cannot revert Migration20261106071117_bot_participant: games with the bot exist (game_players.kind = 'bot' or games.origin = 'bot'). Delete those games first.",
      );
    }
    this.addSql(`drop index "game_players_bot_active_index";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_bot_level_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_bot_kind_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_bot_params_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_bot_no_user_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_bot_seat_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_kind_check";`);
    this.addSql(`alter table "game_players" drop column "bot_level", drop column "bot_memory_mb", drop column "bot_depth_cap";`);
    this.addSql(`alter table "game_players" add constraint "game_players_kind_check" check (kind in ('account', 'guest', 'agent'));`);

    this.addSql(`alter table "games" drop constraint "games_origin_check";`);
    this.addSql(`alter table "games" add constraint "games_origin_check" check (origin in ('invite', 'lobby', 'rematch'));`);
  }

}
