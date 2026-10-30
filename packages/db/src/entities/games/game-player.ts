import { defineEntity, p } from "@mikro-orm/core";

import { User } from "../auth/user";
import { Game } from "./game";

/**
 * A participant of a game: an account or a guest with a one-game token (BR-22).
 * `user` is NULL for a guest and for a deleted account (#37).
 */
export const GamePlayer = defineEntity({
  name: "GamePlayer",
  tableName: "game_players",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    game: () => p.manyToOne(Game).deleteRule("cascade"),
    // 1 = creator, 2 = joining player (#21 Q14).
    seat: p.smallint(),
    // `account` | `guest`; CHECK below.
    kind: p.string().length(16),
    user: () => p.manyToOne(User).deleteRule("set null").nullable(),
    // SHA-256 of the guest token. Nullable even for a guest: NULL means the token was
    // cleared by the cleanup (#39) after `finished_at + 1 h` and must not be required.
    guestTokenHash: p.string().length(64).columnType("char(64)").nullable().unique(),
    // Occupies the player's single game slot (BR-13, #21 Q4): true while the game is
    // `waiting` or `active`. Set to false together with the status change.
    isActive: p.boolean().default(false),
    joinedAt: p.datetime().defaultRaw("now()"),
    // First successful read of the game page by this player (#21 Q20); starts the clock
    // once both players have it.
    seenAt: p.datetime().nullable(),
    // A guest's own nickname (E02-S07), 1-24 code points, set once when the guest joins.
    // NULL = no nickname: the default name "Gracz {seat}" is derived on every read. Always
    // NULL for an account (its name is `users.display_name`).
    nickname: p.string().length(24).nullable(),
  },
  uniques: [
    { name: "game_players_game_id_seat_unique", properties: ["game", "seat"] },
    // NULL user ids (guests, deleted accounts) never collide.
    { name: "game_players_game_id_user_id_unique", properties: ["game", "user"] },
    // BR-13: at most one occupied slot per account.
    {
      name: "game_players_user_id_active_unique",
      properties: ["user"],
      where: "is_active",
    },
  ],
  checks: [
    { name: "game_players_seat_check", expression: `seat in (1, 2)` },
    { name: "game_players_kind_check", expression: `kind in ('account', 'guest')` },
    {
      name: "game_players_guest_no_user_check",
      expression: `kind <> 'guest' or user_id is null`,
    },
    {
      name: "game_players_token_only_guest_check",
      expression: `kind = 'guest' or guest_token_hash is null`,
    },
    {
      name: "game_players_nickname_not_empty_check",
      expression: `nickname is null or char_length(nickname) >= 1`,
    },
    {
      name: "game_players_nickname_only_guest_check",
      expression: `kind = 'guest' or nickname is null`,
    },
  ],
});
