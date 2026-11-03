import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { AdminOverviewService } from "./admin-overview-service";
import type { AdminAccountsQuery } from "./admin-accounts-query";

const query = (over: Partial<AdminAccountsQuery> = {}): AdminAccountsQuery => ({
  page: 1,
  search: "",
  searchKey: "",
  sort: "created",
  direction: "desc",
  ...over,
});

function setup(answers: unknown[][], adminEmail?: string) {
  const execute = vi.fn(async (..._args: unknown[]) => answers.shift() ?? []);
  const service = new AdminOverviewService({ em: { execute } as unknown as EntityManager, adminEmail });
  return { service, execute };
}

const normalized = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("AdminOverviewService.gameCounters", () => {
  it("shapes the single aggregate row", async () => {
    const { service, execute } = setup([
      [{ waiting: 1, active: 2, finished: 9, cancelled: 3, invite: 5, lobby: 3, rematch: 1, five_in_row: 4, draw: 1, timeout: 2, resignation: 2, points: 3 }],
    ]);

    await expect(service.gameCounters()).resolves.toEqual({
      byStatus: { waiting: 1, active: 2, finished: 9, cancelled: 3 },
      finishedByOrigin: { invite: 5, lobby: 3, rematch: 1 },
      finishedByEndReason: { five_in_row: 4, draw: 1, timeout: 2, resignation: 2, points: 3 },
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(normalized(String(execute.mock.calls[0]![0]))).toContain("from games");
  });
});

describe("AdminOverviewService.accountTotals", () => {
  it("derives the unconfirmed count", async () => {
    const { service } = setup([[{ total: 12, verified: 10 }]]);
    await expect(service.accountTotals()).resolves.toEqual({ total: 12, verified: 10, unverified: 2 });
  });
});

describe("AdminOverviewService.accountPage", () => {
  const row = (id: string, email: string, verified: string | null = "2026-11-01T10:00:00Z") => ({
    id,
    email,
    display_name: `Gracz_${id}`,
    email_verified_at: verified,
    created_at: "2026-10-30T08:00:00Z",
  });

  it("returns the page with the finished games per account and the role from ADMIN_EMAIL", async () => {
    const { service, execute } = setup(
      [[{ total: 2 }], [row("a", "Admin@Example.com"), row("b", "ala@example.com", null)], [{ user_id: "a", finished: 7 }]],
      "admin@example.com",
    );

    const page = await service.accountPage(query());

    expect(page).toEqual({
      total: 2,
      page: 1,
      pageCount: 1,
      rows: [
        { id: "a", displayName: "Gracz_a", email: "Admin@Example.com", emailVerified: true, createdAt: new Date("2026-10-30T08:00:00Z"), finishedGames: 7, role: "admin" },
        { id: "b", displayName: "Gracz_b", email: "ala@example.com", emailVerified: false, createdAt: new Date("2026-10-30T08:00:00Z"), finishedGames: 0, role: "player" },
      ],
    });
    const [pageSql, pageParams] = execute.mock.calls[1] as unknown as [string, unknown[]];
    expect(normalized(pageSql)).toBe(
      "select id, email, display_name, email_verified_at, created_at from users order by created_at desc, id desc limit ? offset ?",
    );
    expect(pageParams).toEqual([25, 0]);
    const [countSql, countParams] = execute.mock.calls[2] as unknown as [string, unknown[]];
    expect(normalized(countSql)).toContain("in (?, ?)");
    expect(normalized(countSql)).toContain("g.status = 'finished'");
    expect(countParams).toEqual(["a", "b"]);
  });

  it("searches by name prefix with a bound, escaped pattern and never puts an e-mail into SQL parameters", async () => {
    const { service, execute } = setup([[{ total: 1 }], [row("a", "x@example.com")], []]);

    await service.accountPage(query({ search: "50%_", searchKey: "50%_", sort: "name", direction: "asc" }));

    const [countSql, countParams] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(normalized(countSql)).toBe("select count(*)::int as total from users where display_name_key like ? escape '\\'");
    expect(countParams).toEqual(["50\\%\\_%"]);
    const [pageSql, pageParams] = execute.mock.calls[1] as unknown as [string, unknown[]];
    expect(normalized(pageSql)).toContain("where display_name_key like ? escape '\\' order by display_name_key asc, id asc limit ? offset ?");
    expect(pageParams).toEqual(["50\\%\\_%", 25, 0]);
    expect(JSON.stringify(execute.mock.calls)).not.toContain("example.com");
  });

  it.each([
    ["name", "desc", "order by display_name_key desc, id desc"],
    ["created", "asc", "order by created_at asc, id asc"],
  ] as const)("orders by %s %s", async (sort, direction, clause) => {
    const { service, execute } = setup([[{ total: 1 }], [row("a", "x@example.com")], []]);
    await service.accountPage(query({ sort, direction }));
    expect(normalized(String(execute.mock.calls[1]![0]))).toContain(clause);
  });

  it("cuts a page beyond the last to the last existing one", async () => {
    const { service, execute } = setup([[{ total: 60 }], [row("a", "x@example.com")], []]);

    const page = await service.accountPage(query({ page: 99 }));

    expect(page).toMatchObject({ page: 3, pageCount: 3, total: 60 });
    expect((execute.mock.calls[1] as unknown as [string, unknown[]])[1]).toEqual([25, 50]);
  });

  it("returns an empty page without further queries when nothing matches", async () => {
    const { service, execute } = setup([[{ total: 0 }]]);

    await expect(service.accountPage(query({ page: 4, search: "zz", searchKey: "zz" }))).resolves.toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageCount: 1,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("marks nobody as an administrator when ADMIN_EMAIL is not configured", async () => {
    const { service } = setup([[{ total: 1 }], [row("a", "admin@example.com")], []]);
    expect((await service.accountPage(query())).rows[0]!.role).toBe("player");
  });
});
