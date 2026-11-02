import { Migration } from '@mikro-orm/migrations';

export class Migration20261102221540_audience_closed extends Migration {

  override name = 'Migration20261102221540_audience_closed';

  // Only the `games` column: the generated `chat_messages` statements were snapshot noise (already applied by the spectator chat migration).
  override up(): void | Promise<void> {
    this.addSql(`alter table "games" add "audience_closed_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    // WARNING: drops the record of which games had their audience closed.
    this.addSql(`alter table "games" drop column "audience_closed_at";`);
  }

}
