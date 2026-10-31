import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUserWith, redirect, view } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUserWith: vi.fn(),
  redirect: vi.fn(),
  view: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/http/auth", () => ({ getCurrentUserWith }));
vi.mock("./lobby-panel", () => ({
  LobbyPanel: ({ initial }: { initial: unknown }) => <section data-testid="panel">{JSON.stringify(initial)}</section>,
}));

import LobbyPage, { metadata } from "./page";

const lobby = {
  me: { id: "s1", createdAt: new Date("2026-10-31T12:00:00Z"), expiresInMs: 200_000 },
  currentGame: null,
  seekers: [{ id: "s2", displayName: "Alicja_99", sinceMs: 1000, expiresInMs: 290_000 }],
};

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  view.mockReset().mockResolvedValue(lobby);
  redirect.mockReset().mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  getCurrentUserWith
    .mockReset()
    .mockImplementation(async (read: (user: unknown, cradle: unknown) => unknown) => ({
      user: { id: "u1" },
      data: await read({ id: "u1" }, { lobbyService: { view } }),
    }));
});

describe("LobbyPage", () => {
  it("is dynamic, reads the lobby of the signed-in user and hands the panel only what it needs", async () => {
    const html = renderToStaticMarkup(await LobbyPage());

    expect(connection).toHaveBeenCalledOnce();
    expect(view).toHaveBeenCalledExactlyOnceWith("u1");
    const initial = JSON.parse(/<section data-testid="panel">(.*)<\/section>/.exec(html)![1]!.replaceAll("&quot;", '"'));
    expect(initial).toEqual({
      me: { id: "s1", expiresInMs: 200_000 },
      currentGame: null,
      seekers: lobby.seekers,
    });
    expect(html).not.toContain("createdAt");
  });

  it("passes no status for a user who is not seeking", async () => {
    view.mockResolvedValue({ ...lobby, me: null });

    const html = renderToStaticMarkup(await LobbyPage());

    expect(html).toContain("{&quot;me&quot;:null,");
  });

  it("sends a visitor without an account to the login with a way back", async () => {
    getCurrentUserWith.mockResolvedValue(null);

    await expect(LobbyPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledExactlyOnceWith("/login?next=%2Flobby");
  });

  it("is not indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
