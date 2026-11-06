import { READY_DEADLINE_MS } from "@gomoku/core";

/**
 * Moment the game's clock runs out, as `deadlineMs`/`seatOnTurn` of `@gomoku/core` compute it:
 * `turn_started_at` plus the stored time of the clock-holding seat, or, while the clock never
 * started, the ready deadline after `started_at` (the same term as `CANCEL_NOT_STARTED`). A classic
 * game: the seat on turn (black moves at an even `games.move_count`). A paper game (E11): the
 * count is in `paper_game_states`, and in the automat phase the clock is the opponent's of
 * `auto_seat`, which runs from `turn_started_at`. `ref` is how the enclosing query names `games`
 * (its columns stay unqualified and resolve there; only the paper columns are qualified by `s`,
 * because `move_count` exists in both). Static text only (the constant is a number).
 * Shared by the cleanup rules and the limit of games with the bot (hosted-bot R8): a game past its
 * deadline is abandoned, whether or not anybody has settled it yet.
 */
export const gameDeadlineSql = (ref: string) => `coalesce(
  turn_started_at + (case when (case when variant = 'paper'
      then (select case when s.auto_seat is not null then 3 - s.auto_seat
                        when s.move_count % 2 = 0 then black_seat else 3 - black_seat end
            from paper_game_states s where s.game_id = ${ref}.id)
      else case when move_count % 2 = 0 then black_seat else 3 - black_seat end end) = 1
                          then clock_ms_1 else clock_ms_2 end) * interval '1 millisecond',
  started_at + ${READY_DEADLINE_MS} * interval '1 millisecond'
)`;
