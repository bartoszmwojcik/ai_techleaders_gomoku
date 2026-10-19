import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HealthReport } from "@/server/services/health-service";

import BackendHomePage, { metadata } from "./page";

const { connection, check } = vi.hoisted(() => ({ connection: vi.fn(), check: vi.fn() }));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { healthService: { check } } }),
}));

async function render(report: HealthReport) {
  check.mockResolvedValue(report);
  return renderToStaticMarkup(await BackendHomePage());
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  check.mockReset();
});

describe("BackendHomePage", () => {
  it("is titled and rendered dynamically", async () => {
    expect(metadata).toEqual({ title: "Przegląd" });

    await render({ status: "ok", database: { ok: true } });

    expect(connection).toHaveBeenCalledOnce();
  });

  it("shows a connected database and the game rules", async () => {
    const html = await render({ status: "ok", database: { ok: true } });

    expect(html).toContain("Panel administracyjny");
    expect(html).toContain("Połączono");
    expect(html).not.toContain("Brak połączenia");
    expect(html).toMatch(/Rozmiar planszy<\/td><td[^>]*>15×15<\/td>/);
    expect(html).toMatch(/Kamieni w linii do wygranej<\/td><td[^>]*>5<\/td>/);
  });

  it("shows why the database is unavailable", async () => {
    const html = await render({ status: "error", database: { ok: false, reason: "connection refused" } });

    expect(html).toContain("Brak połączenia");
    expect(html).toContain("connection refused");
    expect(html).not.toContain("Połączono");
  });
});
