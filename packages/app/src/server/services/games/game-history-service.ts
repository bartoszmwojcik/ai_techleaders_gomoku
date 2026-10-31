import {
  decodeHistoryCursor,
  defaultNickname,
  encodeHistoryCursor,
  HISTORY_PAGE_SIZE,
  historyResultOf,
  type EndReason,
  type HistoryEntry,
  type HistoryPage,
  type OpponentKind,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import type { TimeoutSettler } from "./timeout-settler";

type Deps = { em: EntityManager; timeoutSettler: TimeoutSettler };

type Row = {
  id: string;
  /** UTC with microseconds (`2026-10-31T15:04:05.123456Z`): the cursor keeps all of it. */
  finished_at: string;
  end_reason: EndReason;
  winner_seat: Seat | null;
  my_seat: Seat;
  opponent_kind: OpponentKind;
  opponent_seat: Seat;
  opponent_nickname: string | null;
  opponent_name: string | null;
};

// The history is a read model over finished games (engineering standards): one query from the
// player's own rows of `game_players` (`game_players_user_id_index`). Only the opponent's public
// name is selected: never an e-mail and never an account id. The timestamp is formatted in SQL,
// because raw `em.execute` returns dates as text and a JavaScript date would lose the
// microseconds the cursor needs. One row more than a page tells whether there is a next one.
export const historySql = (afterCursor: boolean) => `
  select g.id,
    to_char(g.finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as finished_at,
    g.end_reason, g.winner_seat, me.seat as my_seat,
    op.kind as opponent_kind, op.seat as opponent_seat, op.nickname as opponent_nickname,
    u.display_name as opponent_name
  from game_players me
  join games g on g.id = me.game_id and g.status = 'finished'
  join game_players op on op.game_id = g.id and op.seat <> me.seat
  left join users u on u.id = op.user_id
  where me.user_id = ?${afterCursor ? "\n    and (g.finished_at, g.id) < (?::timestamptz, ?::uuid)" : ""}
  order by g.finished_at desc, g.id desc
  limit ?`;

function opponentNameOf(row: Row): string | null {
  switch (row.opponent_kind) {
    case "account":
      // NULL for a deleted account (BR-17): the UI says "Usunięty gracz".
      return row.opponent_name;
    case "guest":
      return row.opponent_nickname ?? defaultNickname(row.opponent_seat);
    case "agent":
      return null;
  }
}

function toEntry(row: Row): HistoryEntry {
  return {
    gameId: row.id,
    finishedAt: new Date(row.finished_at).toISOString(),
    result: historyResultOf(row.winner_seat, row.my_seat),
    reason: row.end_reason,
    opponent: { kind: row.opponent_kind, name: opponentNameOf(row) },
  };
}

export class GameHistoryService {
  readonly #em: EntityManager;
  readonly #timeoutSettler: TimeoutSettler;

  constructor({ em, timeoutSettler }: Deps) {
    this.#em = em;
    this.#timeoutSettler = timeoutSettler;
  }

  /**
   * One page of the finished games of the account, newest first (E04-S01).
   * @throws ValidationError for a `cursor` that is not one of ours
   */
  async list(userId: string, options: { cursor?: string } = {}): Promise<HistoryPage> {
    // Validated before anything is read or settled.
    const after = options.cursor === undefined ? undefined : decodeHistoryCursor(options.cursor);
    // A game whose clock ran out but nobody opened is finished first, so it is on the list (Q8).
    await this.#timeoutSettler.settleFor(userId);
    const limit = HISTORY_PAGE_SIZE + 1;
    const rows = await this.#em.execute<Row[]>(
      historySql(after !== undefined),
      after ? [userId, after.finishedAt, after.id, limit] : [userId, limit],
    );
    const page = rows.slice(0, HISTORY_PAGE_SIZE);
    const last = page.at(-1);
    return {
      entries: page.map(toEntry),
      nextCursor:
        last && rows.length > HISTORY_PAGE_SIZE
          ? encodeHistoryCursor({ finishedAt: last.finished_at, id: last.id })
          : null,
    };
  }
}
