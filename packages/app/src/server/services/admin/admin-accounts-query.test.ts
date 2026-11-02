import { describe, expect, it } from "vitest";

import { adminAccountsHref, parseAdminAccountsQuery, type AdminAccountsQuery } from "./admin-accounts-query";

describe("parseAdminAccountsQuery", () => {
  it("has defaults", () => {
    expect(parseAdminAccountsQuery({})).toEqual({
      page: 1,
      search: "",
      searchKey: "",
      sort: "created",
      direction: "desc",
    });
  });

  it("reads page, search, sort and direction", () => {
    expect(parseAdminAccountsQuery({ page: "3", q: "  Łu_ka ", sort: "name", dir: "desc" })).toEqual({
      page: 3,
      search: "Łu_ka",
      searchKey: "luka",
      sort: "name",
      direction: "desc",
    });
    expect(parseAdminAccountsQuery({ sort: "name" }).direction).toBe("asc");
    expect(parseAdminAccountsQuery({ sort: "created", dir: "asc" }).direction).toBe("asc");
  });

  it.each([
    [{ page: "0" }, 1],
    [{ page: "-4" }, 1],
    [{ page: "abc" }, 1],
    [{ page: "2.5" }, 1],
    [{ page: "99999999999" }, 1],
    [{ page: ["4", "5"] }, 4],
  ])("falls back to page 1 for %j", (params, page) => {
    expect(parseAdminAccountsQuery(params).page).toBe(page);
  });

  it("falls back for unknown sort and direction and cuts a long search", () => {
    const query = parseAdminAccountsQuery({ sort: "email", dir: "sideways", q: "x".repeat(60) });
    expect(query).toMatchObject({ sort: "created", direction: "desc" });
    expect(query.search).toHaveLength(24);
  });
});

describe("adminAccountsHref", () => {
  const base: AdminAccountsQuery = { page: 1, search: "", searchKey: "", sort: "created", direction: "desc" };

  it("omits defaults", () => {
    expect(adminAccountsHref(base)).toBe("/backend");
  });

  it("keeps the non-default parts and applies changes", () => {
    expect(adminAccountsHref({ ...base, search: "ala", sort: "name", direction: "desc", page: 2 })).toBe(
      "/backend?q=ala&sort=name&dir=desc&page=2",
    );
    expect(adminAccountsHref(base, { direction: "asc" })).toBe("/backend?dir=asc");
    expect(adminAccountsHref({ ...base, sort: "name", direction: "asc" }, { page: 3 })).toBe("/backend?sort=name&page=3");
  });
});
