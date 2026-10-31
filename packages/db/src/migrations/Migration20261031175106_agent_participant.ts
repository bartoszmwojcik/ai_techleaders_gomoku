import { Migration } from '@mikro-orm/migrations';

export class Migration20261031175106_agent_participant extends Migration {

  override name = 'Migration20261031175106_agent_participant';

  override up(): void | Promise<void> {
    this.addSql(`alter table "game_players" drop constraint "game_players_kind_check";`);
    this.addSql(`alter table "game_players" add "agent_token_hash" char(64) null, add "join_channel" varchar(16) not null default 'web', add "agent_name" varchar(40) null;`);
    this.addSql(`alter table "game_players" add constraint "game_players_agent_token_hash_unique" unique ("agent_token_hash");`);
    this.addSql(`alter table "game_players" add constraint "game_players_agent_no_user_check" check (kind <> 'agent' or user_id is null);`);
    this.addSql(`alter table "game_players" add constraint "game_players_agent_seat_check" check (kind <> 'agent' or seat = 2);`);
    this.addSql(`alter table "game_players" add constraint "game_players_token_only_agent_check" check (kind = 'agent' or agent_token_hash is null);`);
    this.addSql(`alter table "game_players" add constraint "game_players_join_channel_check" check (join_channel in ('web', 'mcp'));`);
    this.addSql(`alter table "game_players" add constraint "game_players_agent_channel_check" check ((kind = 'agent') = (join_channel <> 'web'));`);
    this.addSql(`alter table "game_players" add constraint "game_players_agent_name_only_agent_check" check (agent_name is null or kind = 'agent');`);
    this.addSql(`alter table "game_players" add constraint "game_players_agent_name_length_check" check (agent_name is null or char_length(agent_name) between 1 and 40);`);
    this.addSql(`alter table "game_players" add constraint "game_players_kind_check" check (kind in ('account', 'guest', 'agent'));`);
  }

  override async down(): Promise<void> {
    // Dropping the kind would leave rows that violate the old CHECK: refuse instead of losing data.
    const agents = await this.execute(`select 1 from "game_players" where "kind" = 'agent' limit 1`);
    if (agents.length > 0) {
      throw new Error(
        "Cannot revert Migration20261031175106_agent_participant: game_players has rows with kind = 'agent'. Delete those games first.",
      );
    }
    this.addSql(`alter table "game_players" drop constraint "game_players_agent_token_hash_unique";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_agent_no_user_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_agent_seat_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_token_only_agent_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_join_channel_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_agent_channel_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_agent_name_only_agent_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_agent_name_length_check";`);
    this.addSql(`alter table "game_players" drop constraint "game_players_kind_check";`);
    this.addSql(`alter table "game_players" drop column "agent_token_hash", drop column "join_channel", drop column "agent_name";`);
    this.addSql(`alter table "game_players" add constraint "game_players_kind_check" check (kind in ('account', 'guest'));`);
  }

}
