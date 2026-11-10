import { Migration } from '@mikro-orm/migrations';

export class Migration20261110190343_show_origin extends Migration {

  override name = 'Migration20261110190343_show_origin';

  override up(): void | Promise<void> {
    this.addSql(`alter table "games" drop constraint "games_origin_check";`);
    this.addSql(`alter table "games" add constraint "games_origin_check" check (origin in ('invite', 'lobby', 'rematch', 'bot', 'show'));`);

    this.addSql(`alter table "game_players" drop constraint "game_players_bot_seat_check";`);
  }

  override async down(): Promise<void> {
    // The old CHECKs would reject a show game and a bot in seat 1: refuse instead of losing data.
    const shows = await this.execute(`select 1 from "games" where "origin" = 'show' limit 1`);
    const botsInSeat1 = await this.execute(`select 1 from "game_players" where "kind" = 'bot' and "seat" = 1 limit 1`);
    if (shows.length > 0 || botsInSeat1.length > 0) {
      throw new Error(
        "Cannot revert Migration20261110190343_show_origin: show games exist (games.origin = 'show' or a bot in game_players.seat = 1). Delete those games first.",
      );
    }
    this.addSql(`alter table "game_players" add constraint "game_players_bot_seat_check" check (kind <> 'bot' or seat = 2);`);

    this.addSql(`alter table "games" drop constraint "games_origin_check";`);
    this.addSql(`alter table "games" add constraint "games_origin_check" check (origin in ('invite', 'lobby', 'rematch', 'bot'));`);
  }

}
