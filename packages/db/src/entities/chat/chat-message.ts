import { defineEntity, p } from "@mikro-orm/core";

import { Game } from "../games/game";
import { GamePlayer } from "../games/game-player";

/**
 * One chat message of a game (E07-S01). Temporary by design (BR-34): it dies with its game, with
 * its sender's seat, and the cleanup deletes it an hour after the game. It holds no account id,
 * e-mail, address or user agent: the sender is the seat (`sender` -> `game_players`).
 * `seq` is the number of the message in its game (1, 2, 3...), given under the game's advisory
 * lock, so it grows in commit order and a reader's `after_id` cursor never skips a message.
 * `body` is stored already normalized (NFKC); the product limit (200) is applied by the service, the
 * CHECK is only the technical ceiling.
 */
export const ChatMessage = defineEntity({
  name: "ChatMessage",
  tableName: "chat_messages",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    game: () => p.manyToOne(Game).deleteRule("cascade"),
    seq: p.integer(),
    sender: () => p.manyToOne(GamePlayer).deleteRule("cascade"),
    // The id of one send attempt: a retry of the same attempt is the same message (idempotence).
    clientId: p.uuid(),
    body: p.string().length(1000),
    createdAt: p.datetime().defaultRaw("now()"),
  },
  // Both uniques also cover the foreign keys (game_id, sender_id): no extra index needed.
  uniques: [
    { name: "chat_messages_game_id_seq_unique", properties: ["game", "seq"] },
    { name: "chat_messages_sender_id_client_id_unique", properties: ["sender", "clientId"] },
  ],
  checks: [
    { name: "chat_messages_seq_check", expression: "seq >= 1" },
    { name: "chat_messages_body_length_check", expression: "char_length(body) between 1 and 1000" },
  ],
});
