import { z } from "zod";

import { ValidationError } from "../http/errors";
import type { EndReason, ParticipantKind, Seat } from "./types";

/** Rows per page of the history (E04-S01 Q2). */
export const HISTORY_PAGE_SIZE = 20;

/** Longest accepted `cursor` of `GET /api/history`; a real one is about 80 characters. */
export const HISTORY_CURSOR_MAX_LENGTH = 200;

/**
 * Who the opponent was. `agent` (D-28, BR-30) is not played yet: the mapping of the label is
 * exhaustive, so adding the kind to the game fails to compile until the history knows it.
 */
export type OpponentKind = ParticipantKind | "agent";

/** The outcome from the point of view of the one who reads the history. */
export type HistoryResult = "win" | "loss" | "draw";

/**
 * One finished game in the history of an account. The opponent's account id and e-mail are
 * never part of it: only the name that is public anyway. `name` is the nickname of a guest
 * (or `Gracz {seat}`), the display name of an account and `null` for a deleted account.
 */
export type HistoryEntry = {
  gameId: string;
  /** ISO 8601, UTC. */
  finishedAt: string;
  result: HistoryResult;
  reason: EndReason;
  opponent: { kind: OpponentKind; name: string | null };
};

export type HistoryPage = {
  entries: HistoryEntry[];
  /** `null` on the last page. */
  nextCursor: string | null;
};

/** Win, loss or draw for the player in `mySeat`; a game without a winner is a draw. */
export function historyResultOf(winnerSeat: Seat | null, mySeat: Seat): HistoryResult {
  if (winnerSeat === null) return "draw";
  return winnerSeat === mySeat ? "win" : "loss";
}

/** Position in the list: the sort key (`finished_at`, `id`) of the last row of a page. */
export type HistoryCursor = { finishedAt: string; id: string };

// `finishedAt` is the database's own text with microseconds (a JavaScript date would lose
// them and the next page would repeat or skip a row), so its shape is checked, not parsed.
const CURSOR_FINISHED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CURSOR_PARTS = z.tuple([z.string().regex(CURSOR_FINISHED_AT), z.string().regex(CURSOR_ID)]);

export const HISTORY_CURSOR_INVALID_MESSAGE = "Nieprawidłowy parametr cursor.";

export function encodeHistoryCursor({ finishedAt, id }: HistoryCursor): string {
  // Both parts are ASCII, so `btoa` is enough; no `Buffer`, this package also runs in the browser.
  return btoa(`${finishedAt}|${id}`).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function unbase64url(text: string): string | undefined {
  try {
    return atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return undefined;
  }
}

/** @throws ValidationError for a cursor that is not the output of `encodeHistoryCursor`. */
export function decodeHistoryCursor(cursor: string): HistoryCursor {
  const parts = CURSOR_PARTS.safeParse(unbase64url(cursor)?.split("|"));
  if (!parts.success) throw new ValidationError(HISTORY_CURSOR_INVALID_MESSAGE);
  const [finishedAt, id] = parts.data;
  return { finishedAt, id };
}

/** Query of `GET /api/history`: an optional `cursor`. */
export const historyQuerySchema = z.object({
  cursor: z
    .string()
    .max(HISTORY_CURSOR_MAX_LENGTH, { error: HISTORY_CURSOR_INVALID_MESSAGE })
    .optional(),
});
