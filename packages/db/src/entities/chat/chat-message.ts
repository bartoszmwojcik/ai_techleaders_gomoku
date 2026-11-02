import { defineEntity, p } from "@mikro-orm/core";

import { Game } from "../games/game";
import { GamePlayer } from "../games/game-player";
import { GameSpectator } from "../games/game-spectator";

/**
 * One chat message of a game (E07-S01). Temporary by design (BR-34): it dies with its game, with
 * its sender's seat or spectator row, and the cleanup deletes it an hour after the game. It holds no account id,
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
    // A player's seat, or NULL for a spectator's message (then `spectator` and `authorName` are set).
    sender: () => p.manyToOne(GamePlayer).deleteRule("cascade").nullable(),
    // A spectator's message (E10-S03): it goes with the spectator's row, so deleting the account deletes it (BR-34).
    spectator: () => p.manyToOne(GameSpectator).deleteRule("cascade").nullable(),
    // The spectator's nickname or account name when the message was sent (never an e-mail).
    authorName: p.string().length(24).nullable(),
    // The id of one send attempt: a retry of the same attempt is the same message (idempotence).
    clientId: p.uuid(),
    body: p.string().length(1000),
    createdAt: p.datetime().defaultRaw("now()"),
  },
  // Both uniques also cover the foreign keys (game_id, sender_id): no extra index needed.
  uniques: [
    { name: "chat_messages_game_id_seq_unique", properties: ["game", "seq"] },
    { name: "chat_messages_sender_id_client_id_unique", properties: ["sender", "clientId"] },
    { name: "chat_messages_spectator_id_client_id_unique", properties: ["spectator", "clientId"] },
  ],
  checks: [
    { name: "chat_messages_seq_check", expression: "seq >= 1" },
    // A player's message or a spectator's, never both and never neither.
    {
      name: "chat_messages_author_check",
      expression:
        "(sender_id is not null and spectator_id is null and author_name is null) or (sender_id is null and spectator_id is not null and author_name is not null)",
    },
    { name: "chat_messages_body_length_check", expression: "char_length(body) between 1 and 1000" },
  ],
});
