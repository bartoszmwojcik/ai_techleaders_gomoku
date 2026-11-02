import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AdminAccountsQuery } from "@/server/services/admin/admin-accounts-query";
import type { AdminAccountPage, AdminAccountRow } from "@/server/services/admin/admin-overview-service";

import { AccountsSection } from "./accounts-table";

const query = (over: Partial<AdminAccountsQuery> = {}): AdminAccountsQuery => ({
  page: 1,
  search: "",
  searchKey: "",
  sort: "created",
  direction: "desc",
  ...over,
});

const row = (over: Partial<AdminAccountRow> = {}): AdminAccountRow => ({
  id: "u-1",
  displayName: "Ala_7",
  email: "ala@example.com",
  emailVerified: true,
  createdAt: new Date("2026-10-30T08:00:00Z"),
  finishedGames: 4,
  role: "player",
  ...over,
});

const page = (over: Partial<AdminAccountPage> = {}): AdminAccountPage => ({
  rows: [row()],
  total: 1,
  page: 1,
  pageCount: 1,
  ...over,
});

const render = (accounts: AdminAccountPage, q = query()) => renderToStaticMarkup(<AccountsSection accounts={accounts} query={q} />);

describe("AccountsSection", () => {
  it("lists e-mail, confirmation, creation date, finished games and role in an accessible table", () => {
    const html = render(page({ rows: [row(), row({ id: "u-2", displayName: "Szef", email: "admin@example.com", emailVerified: false, role: "admin" })] }));

    expect(html).toMatch(/<caption[^>]*sr-only[^>]*>Konta graczy<\/caption>/);
    expect(html).toContain('scope="col"');
    expect(html).toContain("ala@example.com");
    expect(html).toContain('<time dateTime="2026-10-30T08:00:00.000Z">30.10.2026, 09:00</time>');
    expect(html).toMatch(/<td[^>]*>Tak<\/td>/);
    expect(html).toMatch(/<td[^>]*>Nie<\/td>/);
    expect(html).toContain("Administrator");
    expect(html).toContain("Gracz</span>");
    expect(html).toContain('aria-label="Lista kont"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Strona 1 z 1 (1 kont)");
  });

  it("marks the sorted column and offers the opposite direction; other column starts at its default", () => {
    const byCreated = render(page(), query());
    expect(byCreated).toMatch(/aria-sort="descending"><a href="\/backend\?dir=asc"[^>]*>Założone<\/a>/);
    expect(byCreated).toMatch(/<a href="\/backend\?sort=name"[^>]*>Nazwa<\/a>/);

    const byName = render(page(), query({ sort: "name", direction: "asc" }));
    expect(byName).toMatch(/aria-sort="ascending"><a href="\/backend\?sort=name&amp;dir=desc"[^>]*>Nazwa/);
    expect(byName).toMatch(/<a href="\/backend"[^>]*>Założone<\/a>/);
  });

  it("searches by player name with a GET form that keeps the sort", () => {
    const html = render(page(), query({ search: "ala", sort: "name", direction: "asc" }));

    expect(html).toMatch(/<form[^>]*action="\/backend"[^>]*method="get"/);
    expect(html).toContain('role="search"');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="ala"');
    expect(html).toContain('maxLength="24"');
    expect(html).toContain('<input type="hidden" name="sort" value="name"/>');
    expect(html).toContain("Szukaj po nazwie gracza");
    expect(render(page())).not.toContain('type="hidden"');
  });

  it("pages with plain links", () => {
    const middle = render(page({ page: 2, pageCount: 3, total: 60 }), query({ page: 2, search: "a" }));
    expect(middle).toContain('<a href="/backend?q=a">Poprzednia</a>');
    expect(middle).toContain('<a href="/backend?q=a&amp;page=3">Następna</a>');

    const only = render(page());
    expect(only).not.toContain("Poprzednia");
    expect(only).not.toContain("Następna");
  });

  it("says so when nothing matches", () => {
    const html = render(page({ rows: [], total: 0 }), query({ search: "zzz" }));
    expect(html).toContain("Brak kont pasujących do wyszukiwania.");
    expect(html).not.toContain("<table");
    expect(html).toContain("Strona 1 z 1 (0 kont)");
  });
});
