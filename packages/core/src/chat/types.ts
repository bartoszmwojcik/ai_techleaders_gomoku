import type { Seat } from "../games/types";

/** What the chat of a game is for the asking participant (R2, R9). */
export type ChatState = "open" | "disabled_by_you" | "disabled_by_opponent" | "unavailable" | "closed";

/** Why a message text is refused (R8, R10). */
export type ChatRejection =
  | "not_text"
  | "empty"
  | "too_long"
  | "control_char"
  | "invisible_char"
  | "combining_run"
  | "url";

/** A message as the participants see it: the seat, never an account or a token. */
export type ChatMessageView = {
  /** The number of the message in its game (1, 2, 3...): the cursor of `after_id`. */
  id: number;
  seat: Seat;
  text: string;
  createdAt: string;
};

export type ChatLimits = { maxLength: number; minIntervalMs: number };

/** `data` of `GET /api/games/{id}/chat`. */
export type ChatReadData = {
  state: ChatState;
  /** Ascending by `id`; empty unless the chat can be read by this participant. */
  messages: ChatMessageView[];
  /** The largest `id` in `messages`, else the `after_id` that was asked for (0 without it). */
  lastId: number;
  limits: ChatLimits;
  /** Only while the asker is within the minimum interval after their own last message. */
  retryAfterMs?: number;
};

/** `data` of `POST /api/games/{id}/chat`; `201` for a new message, `200` for a retry of the same attempt. */
export type ChatSendData = {
  message: ChatMessageView;
  /** How long until this participant may send again. */
  retryAfterMs: number;
};
