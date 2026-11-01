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
}): ChatState {
  if (game.status === "waiting" || game.status === "cancelled") return "unavailable";
  if (game.status === "finished" && !game.windowOpen) return "closed";
  if (!game.mine) return "disabled_by_you";
  return game.theirs === false ? "disabled_by_opponent" : "open";
}
