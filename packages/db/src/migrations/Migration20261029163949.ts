import { Migration } from '@mikro-orm/migrations';

export class Migration20261029163949 extends Migration {

  override name = 'Migration20261029163949';

  override up(): void | Promise<void> {
    this.addSql(`alter table "games" add "black_seat" smallint null, add "move_count" smallint not null default 0, add "stones_black" bit(225) not null default (repeat('0', 225))::bit(225), add "stones_white" bit(225) not null default (repeat('0', 225))::bit(225), add "moves" bytea not null default '', add "winner_seat" smallint null, add "end_reason" varchar(16) null;`);
    // Games already running (#21) get black deterministically before the CHECK that needs it.
    this.addSql(`update "games" set "black_seat" = 1 where "status" in ('active', 'finished');`);
    this.addSql(`alter table "games" add constraint "games_black_seat_check" check (black_seat in (1, 2));`);
    this.addSql(`alter table "games" add constraint "games_winner_seat_check" check (winner_seat in (1, 2));`);
    this.addSql(`alter table "games" add constraint "games_end_reason_check" check (end_reason in ('five_in_row', 'draw', 'timeout', 'resignation'));`);
    this.addSql(`alter table "games" add constraint "games_move_count_check" check (move_count between 0 and 225);`);
    this.addSql(`alter table "games" add constraint "games_board_disjoint_check" check ((stones_black & stones_white) = (repeat('0', 225))::bit(225));`);
    this.addSql(`alter table "games" add constraint "games_stone_count_check" check (bit_count(stones_black) + bit_count(stones_white) = move_count);`);
    this.addSql(`alter table "games" add constraint "games_alternation_check" check (bit_count(stones_black) - bit_count(stones_white) in (0, 1));`);
    this.addSql(`alter table "games" add constraint "games_moves_length_check" check (octet_length(moves) = move_count);`);
    this.addSql(`alter table "games" add constraint "games_active_black_seat_check" check (status not in ('active', 'finished') or black_seat is not null);`);
    this.addSql(`alter table "games" add constraint "games_finished_end_reason_check" check ((status = 'finished') = (end_reason is not null));`);
    this.addSql(`alter table "games" add constraint "games_draw_no_winner_check" check (end_reason is distinct from 'draw' or winner_seat is null);`);
    this.addSql(`alter table "games" add constraint "games_winner_required_check" check (end_reason is null or end_reason = 'draw' or winner_seat is not null);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "games" drop constraint "games_black_seat_check";`);
    this.addSql(`alter table "games" drop constraint "games_winner_seat_check";`);
    this.addSql(`alter table "games" drop constraint "games_end_reason_check";`);
    this.addSql(`alter table "games" drop constraint "games_move_count_check";`);
    this.addSql(`alter table "games" drop constraint "games_board_disjoint_check";`);
    this.addSql(`alter table "games" drop constraint "games_stone_count_check";`);
    this.addSql(`alter table "games" drop constraint "games_alternation_check";`);
    this.addSql(`alter table "games" drop constraint "games_moves_length_check";`);
    this.addSql(`alter table "games" drop constraint "games_active_black_seat_check";`);
    this.addSql(`alter table "games" drop constraint "games_finished_end_reason_check";`);
    this.addSql(`alter table "games" drop constraint "games_draw_no_winner_check";`);
    this.addSql(`alter table "games" drop constraint "games_winner_required_check";`);
    this.addSql(`alter table "games" drop column "black_seat", drop column "move_count", drop column "stones_black", drop column "stones_white", drop column "moves", drop column "winner_seat", drop column "end_reason";`);
  }

}
