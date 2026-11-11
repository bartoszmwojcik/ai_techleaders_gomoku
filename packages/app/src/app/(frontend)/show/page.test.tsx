import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireAdmin, loadShowOverview, request } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireAdmin: vi.fn(),
  loadShowOverview: vi.fn(),
  request: { lang: undefined as string | undefined },
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/http/admin-gate", () => ({ requireAdmin }));
vi.mock("@/server/http/show-view", () => ({ loadShowOverview }));

import ShowConsolePage, { metadata } from "./page";

const overview = { enabled: true, botVsBotEnabled: true, level2Enabled: false, preflight: { ok: true, checks: [] }, current: null };

beforeEach(() => {
  request.lang = undefined;
  connection.mockReset().mockResolvedValue(undefined);
  requireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
  loadShowOverview.mockReset().mockResolvedValue(overview);
});

describe("/show", () => {
  it("gates first, then renders the console with the overview, not indexed and without a title of its own", async () => {
    const html = renderToStaticMarkup(await ShowConsolePage());

    expect(connection).toHaveBeenCalledOnce();
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(loadShowOverview.mock.invocationCallOrder[0]!);
    expect(html).toContain("Rozpocznij pokaz");
    expect(metadata).toEqual({ robots: { index: false, follow: false } });
  });

  it("reads nothing for anybody but the administrator", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(ShowConsolePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadShowOverview).not.toHaveBeenCalled();
  });

  it("speaks the request's language", async () => {
    request.lang = "fr";

    expect(renderToStaticMarkup(await ShowConsolePage())).toContain("Lancer la démonstration");
  });
});
