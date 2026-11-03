import { isInstallationAdmin } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import { ADMIN_PAGE_SIZE, type AdminAccountsQuery } from "./admin-accounts-query";

type Deps = { em: EntityManager; adminEmail?: string };

export type GameCounters = {
  /** Games in the database right now (the cleanup removes finished/cancelled ones without accounts after ~1 h). */
  byStatus: { waiting: number; active: number; finished: number; cancelled: number };
  /** Finished games still in the database. */
  finishedByOrigin: { invite: number; lobby: number; rematch: number };
  finishedByEndReason: { five_in_row: number; draw: number; timeout: number; resignation: number; points: number };
};

export type AccountTotals = { total: number; verified: number; unverified: number };

export type AdminAccountRow = {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  /** Finished games of the account (as in the history, #27). */
  finishedGames: number;
  role: "admin" | "player";
};

export type AdminAccountPage = {
  rows: AdminAccountRow[];
  /** Accounts matching the search. */
  total: number;
  /** The page actually shown (the requested one cut to the last existing). */
  page: number;
  pageCount: number;
};

// Static SQL: values are bound parameters (`?`), identifiers and order clauses come from this file only.
const GAME_COUNTERS_SQL = `
  select
    count(*) filter (where status = 'waiting')::int as waiting,
    count(*) filter (where status = 'active')::int as active,
    count(*) filter (where status = 'finished')::int as finished,
    count(*) filter (where status = 'cancelled')::int as cancelled,
    count(*) filter (where status = 'finished' and origin = 'invite')::int as invite,
    count(*) filter (where status = 'finished' and origin = 'lobby')::int as lobby,
    count(*) filter (where status = 'finished' and origin = 'rematch')::int as rematch,
    count(*) filter (where status = 'finished' and end_reason = 'five_in_row')::int as five_in_row,
    count(*) filter (where status = 'finished' and end_reason = 'draw')::int as draw,
    count(*) filter (where status = 'finished' and end_reason = 'timeout')::int as timeout,
    count(*) filter (where status = 'finished' and end_reason = 'resignation')::int as resignation,
    count(*) filter (where status = 'finished' and end_reason = 'points')::int as points
  from games`;

const ACCOUNT_TOTALS_SQL = `
  select count(*)::int as total, count(*) filter (where email_verified_at is not null)::int as verified from users`;

const SEARCH_FILTER = ` where display_name_key like ? escape '\\'`;
const COUNT_SQL = `select count(*)::int as total from users`;
const PAGE_SQL = `select id, email, display_name, email_verified_at, created_at from users`;
const ORDER = {
  created: { asc: ` order by created_at asc, id asc`, desc: ` order by created_at desc, id desc` },
  name: { asc: ` order by display_name_key asc, id asc`, desc: ` order by display_name_key desc, id desc` },
} as const;
const LIMIT_SQL = ` limit ? offset ?`;

const finishedGamesSql = (count: number) => `
  select gp.user_id, count(*)::int as finished
  from game_players gp join games g on g.id = gp.game_id
  where gp.user_id in (${Array.from({ length: count }, () => "?").join(", ")}) and g.status = 'finished'
  group by gp.user_id`;

type PageRow = {
  id: string;
  email: string;
  display_name: string;
  email_verified_at: string | null;
  created_at: string;
};

const likePrefix = (key: string) => `${key.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * Read model of the admin panel (E08-S02): game counters, account totals and one page of accounts.
 * Read-only. The e-mail travels only in the returned rows - never as a query parameter, in a log
 * line or in an error message - and the role is decided in TypeScript from `ADMIN_EMAIL` (BR-35).
 * The per-pair counter (E06-S03) is read from `FinishedGameStatsService`, not computed here.
 */
export class AdminOverviewService {
  readonly #em: EntityManager;
  readonly #adminEmail: string | undefined;

  constructor({ em, adminEmail }: Deps) {
    this.#em = em;
    this.#adminEmail = adminEmail;
  }

  async gameCounters(): Promise<GameCounters> {
    const [row] = await this.#em.execute<Record<string, number>[]>(GAME_COUNTERS_SQL);
    const r = row!;
    return {
      byStatus: { waiting: r.waiting!, active: r.active!, finished: r.finished!, cancelled: r.cancelled! },
      finishedByOrigin: { invite: r.invite!, lobby: r.lobby!, rematch: r.rematch! },
      finishedByEndReason: {
        five_in_row: r.five_in_row!,
        draw: r.draw!,
        timeout: r.timeout!,
        resignation: r.resignation!,
        points: r.points!,
      },
    };
  }

  async accountTotals(): Promise<AccountTotals> {
    const [row] = await this.#em.execute<{ total: number; verified: number }[]>(ACCOUNT_TOTALS_SQL);
    const { total, verified } = row!;
    return { total, verified, unverified: total - verified };
  }

  async accountPage(query: AdminAccountsQuery): Promise<AdminAccountPage> {
    const filter = query.searchKey ? SEARCH_FILTER : "";
    const filterParams = query.searchKey ? [likePrefix(query.searchKey)] : [];
    const [counted] = await this.#em.execute<{ total: number }[]>(`${COUNT_SQL}${filter}`, filterParams);
    const total = counted!.total;
    const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    const page = Math.min(query.page, pageCount);
    if (total === 0) return { rows: [], total, page, pageCount };

    const rows = await this.#em.execute<PageRow[]>(
      `${PAGE_SQL}${filter}${ORDER[query.sort][query.direction]}${LIMIT_SQL}`,
      [...filterParams, ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE],
    );
    // Only for the accounts of this page (`game_players_user_id_index`).
    const counts = await this.#em.execute<{ user_id: string; finished: number }[]>(
      finishedGamesSql(rows.length),
      rows.map(({ id }) => id),
    );
    const finishedBy = new Map(counts.map(({ user_id, finished }) => [user_id, finished]));
    return {
      total,
      page,
      pageCount,
      rows: rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        emailVerified: row.email_verified_at !== null,
        createdAt: new Date(row.created_at),
        finishedGames: finishedBy.get(row.id) ?? 0,
        role: isInstallationAdmin(row.email, this.#adminEmail) ? "admin" : "player",
      })),
    };
  }
}
