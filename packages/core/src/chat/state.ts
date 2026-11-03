import type { GameStatus } from "../games/types";
import type { ChatState } from "./types";

/**
 * What the chat of a game is for one participant (R2, R9). `windowOpen` says that a finished game
 * ended less than `CHAT_RETENTION_MS` ago (the server's clock); `mine` and `theirs` are the two
 * `chat_enabled` settings, `theirs` is `null` while the game has no second player. Turning the chat
 * off silences both sides' writing (`disabled_by_*`) but only the one who turned it off stops
 * seeing the conversation.
 */
export function deriveChatState(game: {
  status: GameStatus;
  windowOpen: boolean;
  mine: boolean;
  theirs: boolean | null;
  /**
   * A public game (BR-41): the other player's choice does not cut the asker off from the spectators,
   * so it never makes the chat `disabled_by_opponent`. Your own choice still does.
   */
  isPublic?: boolean;
}): ChatState {
  if (game.status === "waiting" || game.status === "cancelled") return "unavailable";
  if (game.status === "finished" && !game.windowOpen) return "closed";
  if (!game.mine) return "disabled_by_you";
  return game.theirs === false && !game.isPublic ? "disabled_by_opponent" : "open";
}

/**
 * What the chat of a game is for a spectator (E10-S03): the players' settings never touch it (BR-41,
 * a spectator has no switch), only the game does - as for the players, a game that is not under way
 * has no chat, and a finished one keeps it for `CHAT_RETENTION_MS`.
 */
export function deriveSpectatorChatState(game: { status: GameStatus; windowOpen: boolean }): ChatState {
  if (game.status === "waiting" || game.status === "cancelled") return "unavailable";
  return game.status === "finished" && !game.windowOpen ? "closed" : "open";
}
