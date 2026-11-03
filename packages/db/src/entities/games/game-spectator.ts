import { defineEntity, p } from "@mikro-orm/core";

import { User } from "../auth/user";
import { Game } from "./game";

/**
 * A spectator of a public game (E10-S02, D-33, BR-39): somebody with the code who watches once both
 * seats are taken. Temporary and outside the game's participants: no seat, no `game_players` row,
 * so the spectator never reaches a history (BR-24) and never takes the single game slot (BR-13).
 * Either an account (`user`) or a visitor holding a token (`tokenHash`, SHA-256 as a guest's)
 * with an optional nickname of 1-24 characters (BR-41). `lastSeenAt` is the presence the limit of
 * 20 (BR-42) counts and the later counter (BR-45) shows; `expiresAt` is the access, slid with the
 * reads, and the cleanup deletes the row after it. The row also goes with its game and its account.
 */
export const GameSpectator = defineEntity({
  name: "GameSpectator",
  tableName: "game_spectators",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    game: () => p.manyToOne(Game).deleteRule("cascade"),
    user: () => p.manyToOne(User).deleteRule("cascade").nullable(),
    nickname: p.string().length(24).nullable(),
    tokenHash: p.string().length(64).columnType("char(64)").nullable().unique(),
    createdAt: p.datetime().defaultRaw("now()"),
    lastSeenAt: p.datetime().defaultRaw("now()"),
    expiresAt: p.datetime().index(),
  },
  indexes: [
    // The presence count of a game (limit, counter) and the lookup of its spectators.
    { name: "game_spectators_game_id_last_seen_at_index", properties: ["game", "lastSeenAt"] },
    // The `cascade` of `DELETE FROM users`.
    { name: "game_spectators_user_id_index", properties: ["user"] },
  ],
  // NULL user ids (visitors) never collide: one row per account and game.
  uniques: [{ name: "game_spectators_game_id_user_id_unique", properties: ["game", "user"] }],
  checks: [
    // An account or a token, never both and never neither.
    {
      name: "game_spectators_identity_check",
      expression: "(user_id is not null) <> (token_hash is not null)",
    },
    // Only a visitor picks a nickname; an account is named by the account.
    {
      name: "game_spectators_nickname_check",
      expression: "nickname is null or (token_hash is not null and char_length(nickname) between 1 and 24)",
    },
    { name: "game_spectators_expiry_check", expression: "expires_at > created_at" },
  ],
});
