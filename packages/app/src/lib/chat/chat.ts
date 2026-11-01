import type { ChatMessageView, ChatState } from "@gomoku/core/chat/types";

/** The chat is read every 3 s (R16); an idle one every 10 s. */
export const CHAT_POLL_INTERVAL_MS = 3000;
/** A chat with no message for this long is idle. */
export const CHAT_IDLE_AFTER_MS = 60_000;
export const CHAT_IDLE_POLL_INTERVAL_MS = 10_000;
/** A read or a send that takes longer is abandoned, so one hung request cannot stop the chat for good. */
export const CHAT_TIMEOUT_MS = 8000;
/** Failed reads in a row before the alert appears. */
export const CHAT_FAILURES_BEFORE_ALERT = 3;
/** The server's default page; a read that returns a full page is followed by another. */
export const CHAT_PAGE_SIZE = 50;

/** The states in which the conversation is shown (the one who turned the chat off does not see it, R2). */
export function isReadable(state: ChatState): boolean {
  return state === "open" || state === "disabled_by_opponent";
}

/** Adds `incoming` to `known` by message number: no duplicates, ascending. */
export function mergeMessages(known: ChatMessageView[], incoming: ChatMessageView[]): ChatMessageView[] {
  const byId = new Map(known.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** `HH:MM` of an ISO time in the viewer's zone, for the small time under a message. */
export function messageTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "znak", "znaki", "znaków" for a count (Polish plural). */
export function pluralChars(count: number): string {
  if (count === 1) return "znak";
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? "znaki" : "znaków";
}

/** "nowa", "nowe", "nowych" for a count of messages (Polish plural). */
export function pluralNew(count: number): string {
  if (count === 1) return "nowa";
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? "nowe" : "nowych";
}

/**
 * The id of one send attempt. `randomUUID` exists only in a secure context (https, localhost), so a
 * page served over plain http falls back to `getRandomValues`, which is always there.
 */
export function newClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
