import { Migration } from '@mikro-orm/migrations';

export class Migration20261102191800_public_games extends Migration {

  override name = 'Migration20261102191800_public_games';

  override up(): void | Promise<void> {
    // Existing games stay private (default false); the flag is set only by an invitation (D-33, BR-40).
    this.addSql(`alter table "games" add "is_public" boolean not null default false;`);
  }

  override down(): void | Promise<void> {
    // WARNING: drops the public flag of every game.
    this.addSql(`alter table "games" drop column "is_public";`);
  }

}
