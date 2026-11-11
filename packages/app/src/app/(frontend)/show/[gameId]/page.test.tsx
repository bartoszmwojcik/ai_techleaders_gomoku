import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireAdmin, loadShowView, notFound, request } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireAdmin: vi.fn(),
  loadShowView: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  request: { lang: undefined as string | undefined },
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/http/admin-gate", () => ({ requireAdmin }));
vi.mock("@/server/http/show-view", () => ({ loadShowView }));

import ShowPage, { metadata } from "./page";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const show = {
  status: "active",
  variant: "classic",
  timeControlMs: 600_000,
  moveCount: 0,
  blackSeat: 1,
  turnSeat: 1,
  moves: [],
  result: null,
  clock: { remainingMs: [600_000, 600_000], running: 1, now: 1 },
  layout: "bot-bot",
  players: [
    { seat: 1, kind: "bot", displayName: "Bot · poziom 1", bot: { level: 1, memoryMb: null, tableMb: null } },
    { seat: 2, kind: "bot", displayName: "Bot · poziom 2 · 16 MB", bot: { level: 2, memoryMb: 768, tableMb: 16 } },
  ],
};

const page = (gameId = GAME, projektor?: string | string[]) =>
  ShowPage({ params: Promise.resolve({ gameId }), searchParams: Promise.resolve(projektor === undefined ? {} : { projektor }) });

beforeEach(() => {
  request.lang = undefined;
  connection.mockReset().mockResolvedValue(undefined);
  requireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
  loadShowView.mockReset().mockResolvedValue(show);
  notFound.mockClear();
});

describe("/show/[gameId]", () => {
  it("gates first, then renders the show in the normal view, not indexed and without a title of its own", async () => {
    const html = renderToStaticMarkup(await page());

    expect(connection).toHaveBeenCalledOnce();
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(loadShowView.mock.invocationCallOrder[0]!);
    expect(loadShowView).toHaveBeenCalledWith(GAME);
    expect(html).toContain("Pokaz: Bot vs bot");
    expect(html).toContain('aria-checked="false"');
    expect(metadata).toEqual({ robots: { index: false, follow: false } });
  });

  it("takes the projector view from the address (P20)", async () => {
    expect(renderToStaticMarkup(await page(GAME, "1"))).toContain('data-projector="true"');
    expect(renderToStaticMarkup(await page(GAME, "0"))).not.toContain("data-projector");
  });

  it("is the 404 of a missing page for a bad id and a game that is not a show", async () => {
    await expect(page("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadShowView).not.toHaveBeenCalled();
    loadShowView.mockResolvedValue(null);
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("reads nothing for anybody but the administrator", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadShowView).not.toHaveBeenCalled();
  });

  it("speaks the request's language, with the bots named from their strength", async () => {
    request.lang = "fr";
    const html = renderToStaticMarkup(await page());

    expect(html).toContain("Démonstration : Bot contre bot");
    expect(html).toContain("Bot · niveau 2 · 16 Mo");
  });
});
