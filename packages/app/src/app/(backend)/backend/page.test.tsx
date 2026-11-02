import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HealthReport } from "@/server/services/health-service";

import BackendHomePage, { metadata } from "./page";

const m = vi.hoisted(() => ({
  connection: vi.fn(),
  requireAdmin: vi.fn(),
  check: vi.fn(),
  gameCounters: vi.fn(),
  accountTotals: vi.fn(),
  accountPage: vi.fn(),
  finishedByPair: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: m.connection }));
vi.mock("@/server/http/admin-gate", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({
      cradle: {
        healthService: { check: m.check },
        adminOverviewService: { gameCounters: m.gameCounters, accountTotals: m.accountTotals, accountPage: m.accountPage },
        finishedGameStatsService: { finishedByPair: m.finishedByPair },
      },
    }),
}));

const stats = { timeZone: "Europe/Warsaw", total: 1, today: 1, last7Days: 1, pairs: [] };

async function render(report: HealthReport, searchParams: Record<string, string> = {}) {
  m.check.mockResolvedValue(report);
  return renderToStaticMarkup(await BackendHomePage({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  for (const mock of Object.values(m)) mock.mockReset();
  m.connection.mockResolvedValue(undefined);
  m.requireAdmin.mockResolvedValue({ id: "u-1" });
  m.gameCounters.mockResolvedValue({
    byStatus: { waiting: 0, active: 0, finished: 0, cancelled: 0 },
    finishedByOrigin: { invite: 0, lobby: 0, rematch: 0 },
    finishedByEndReason: { five_in_row: 0, draw: 0, timeout: 0, resignation: 0 },
  });
  m.accountTotals.mockResolvedValue({ total: 1, verified: 1, unverified: 0 });
  m.finishedByPair.mockResolvedValue(stats);
  m.accountPage.mockResolvedValue({
    rows: [{ id: "u-1", displayName: "Ala", email: "ala@example.com", emailVerified: true, createdAt: new Date("2026-10-30T08:00:00Z"), finishedGames: 0, role: "player" }],
    total: 1,
    page: 1,
    pageCount: 1,
  });
});

describe("BackendHomePage", () => {
  it("is titled and rendered dynamically", async () => {
    expect(metadata).toEqual({ title: "Przegląd" });

    await render({ status: "ok", database: { ok: true } });

    expect(m.connection).toHaveBeenCalledOnce();
  });

  it("checks the administrator first, before any read, and stops on the 404", async () => {
    m.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(render({ status: "ok", database: { ok: true } })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.connection).not.toHaveBeenCalled();
    expect(m.check).not.toHaveBeenCalled();
    expect(m.accountPage).not.toHaveBeenCalled();
  });

  it("shows the counters, the accounts, the connected database and the game rules", async () => {
    const html = await render({ status: "ok", database: { ok: true } });

    expect(html).toContain("Panel administracyjny");
    expect(html).toContain("Liczniki");
    expect(html).toContain("ala@example.com");
    expect(html).toContain("Połączono");
    expect(html).not.toContain("Brak połączenia");
    expect(html).not.toContain("Nie udało się wczytać danych");
    expect(html).toMatch(/Rozmiar planszy<\/td><td[^>]*>15×15<\/td>/);
    expect(html).toMatch(/Kamieni w linii do wygranej<\/td><td[^>]*>5<\/td>/);
  });

  it("passes the parsed search parameters to the account list", async () => {
    await render({ status: "ok", database: { ok: true } }, { q: "Ala", sort: "name", page: "2" });

    expect(m.accountPage).toHaveBeenCalledWith({ page: 2, search: "Ala", searchKey: "ala", sort: "name", direction: "asc" });
  });

  it("keeps the database failure reason out of the page and logs it on the server", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const html = await render({ status: "error", database: { ok: false, reason: "connection refused" } });

    expect(html).toContain("Brak połączenia");
    expect(html).toContain("Sprawdź logi serwera.");
    expect(html).not.toContain("connection refused");
    expect(error).toHaveBeenCalledWith("Backend panel: database check failed", "connection refused");
    error.mockRestore();
  });

  it("shows a neutral error card when reading fails and logs only the class and code, never an e-mail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    m.accountPage.mockRejectedValue(Object.assign(new Error("select ... where email = 'ala@example.com'"), { code: "57P01" }));

    const html = await render({ status: "ok", database: { ok: true } });

    expect(html).toContain("Nie udało się wczytać danych");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("ala@example.com");
    expect(error).toHaveBeenCalledWith("Backend panel: reading the data failed", { name: "Error", code: "57P01" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("ala@example.com");
    error.mockRestore();
  });
});
