import { normalizeDisplayName } from "@gomoku/core";
import { z } from "zod";

export const ADMIN_PAGE_SIZE = 25;
export const SEARCH_MAX_LENGTH = 24;

export type AdminAccountsSort = "created" | "name";
export type AdminAccountsDirection = "asc" | "desc";

export type AdminAccountsQuery = {
  page: number;
  /** Raw (trimmed, cut) search text, for the form field. */
  search: string;
  /** `display_name_key` prefix to search by, from `normalizeDisplayName`; empty = no search. */
  searchKey: string;
  sort: AdminAccountsSort;
  direction: AdminAccountsDirection;
};

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const pageSchema = z.coerce.number().int().min(1).max(1_000_000).catch(1);
const sortSchema = z.enum(["created", "name"]).catch("created");
const directionSchema = z.enum(["asc", "desc"]).optional().catch(undefined);

/**
 * Reads the `searchParams` of the panel. Anything unknown or out of range falls back to the default
 * (never an error, never a 500). The search is by player name only: an e-mail in the URL would end up
 * in logs, proxies and `Referer` (E08-S02 Q6).
 */
export function parseAdminAccountsQuery(params: Params): AdminAccountsQuery {
  const sort = sortSchema.parse(first(params.sort));
  const direction = directionSchema.parse(first(params.dir)) ?? (sort === "name" ? "asc" : "desc");
  const search = (first(params.q) ?? "").trim().slice(0, SEARCH_MAX_LENGTH).trim();
  return {
    page: pageSchema.parse(first(params.page)),
    search,
    searchKey: normalizeDisplayName(search),
    sort,
    direction,
  };
}

/** The query string of a panel link (defaults omitted). */
export function adminAccountsHref(query: AdminAccountsQuery, change: Partial<AdminAccountsQuery> = {}): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.search) params.set("q", next.search);
  if (next.sort !== "created") params.set("sort", next.sort);
  const defaultDirection = next.sort === "name" ? "asc" : "desc";
  if (next.direction !== defaultDirection) params.set("dir", next.direction);
  if (next.page > 1) params.set("page", String(next.page));
  const text = params.toString();
  return text ? `/backend?${text}` : "/backend";
}
