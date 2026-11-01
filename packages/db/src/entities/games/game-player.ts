import { defineEntity, p } from "@mikro-orm/core";

import { User } from "../auth/user";
import { Game } from "./game";

/**
 * A participant of a game: an account, a guest with a one-game token (BR-22) or an agent that
 * joined over MCP with a one-game token of its own (BR-31, E06-S01).
 * `user` is NULL for a guest, an agent and a deleted account (#37).
 */
export const GamePlayer = defineEntity({
  name: "GamePlayer",
  tableName: "game_players",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    game: () => p.manyToOne(Game).deleteRule("cascade"),
    // 1 = creator, 2 = joining player (#21 Q14).
    seat: p.smallint(),
    // `account` | `guest` | `agent`; CHECK below.
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
    // SHA-256 of the agent's token (E06-S01): kept apart from `guest_token_hash`, so a guest cookie
    // and an agent token can never authenticate for one another. Nullable for the same reason as
    // the guest's: the cleanup clears it 1 h after the game finished.
    agentTokenHash: p.string().length(64).columnType("char(64)").nullable().unique(),
    // Where the participant came in from: `web` (every account and guest) or `mcp` (an agent).
    joinChannel: p.string().length(16).default("web"),
    // The model name an agent declared on joining (decision 7 of #138): unverified, shown with
    // "(deklarowane)". NULL = no name. Always NULL for anyone but an agent.
    agentName: p.string().length(40).nullable(),
    // The participant's chat setting (E07-S01): `false` once they turned the chat off (S02 writes
    // it); a new seat, a rematch included, starts with it on. Read by the chat service only.
    chatEnabled: p.boolean().default(true),
  },
  indexes: [
    // Lookups by account: the `set null` action of `DELETE FROM users` (#37), the cleanup rule of
    // unverified accounts (9.4) and the history (#27) would otherwise scan the whole table.
    { name: "game_players_user_id_index", properties: ["user"] },
  ],
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
    { name: "game_players_kind_check", expression: `kind in ('account', 'guest', 'agent')` },
    {
      name: "game_players_guest_no_user_check",
      expression: `kind <> 'guest' or user_id is null`,
    },
    {
      name: "game_players_token_only_guest_check",
      expression: `kind = 'guest' or guest_token_hash is null`,
    },
    {
      name: "game_players_agent_no_user_check",
      expression: `kind <> 'agent' or user_id is null`,
    },
    // An agent never creates a game (BR-30): the creator is seat 1.
    {
      name: "game_players_agent_seat_check",
      expression: `kind <> 'agent' or seat = 2`,
    },
    {
      name: "game_players_token_only_agent_check",
      expression: `kind = 'agent' or agent_token_hash is null`,
    },
    { name: "game_players_join_channel_check", expression: `join_channel in ('web', 'mcp')` },
    {
      name: "game_players_agent_channel_check",
      expression: `(kind = 'agent') = (join_channel <> 'web')`,
    },
    {
      name: "game_players_agent_name_only_agent_check",
      expression: `agent_name is null or kind = 'agent'`,
    },
    {
      name: "game_players_agent_name_length_check",
      expression: `agent_name is null or char_length(agent_name) between 1 and 40`,
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
