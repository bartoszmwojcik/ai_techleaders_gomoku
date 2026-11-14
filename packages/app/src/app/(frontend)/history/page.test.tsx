import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUserWith, redirect, list } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUserWith: vi.fn(),
  redirect: vi.fn(),
  list: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/http/auth", () => ({ getCurrentUserWith }));
vi.mock("./history-view", () => ({
  HistoryView: ({ initial }: { initial: unknown }) => <section data-testid="view">{JSON.stringify(initial)}</section>,
}));

const request = vi.hoisted(() => ({ lang: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));

import HistoryPage, { generateMetadata } from "./page";

const first = { entries: [], nextCursor: "abc" };

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  list.mockReset().mockResolvedValue(first);
  redirect.mockReset().mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  getCurrentUserWith
    .mockReset()
    .mockImplementation(async (read: (user: unknown, cradle: unknown) => unknown) => ({
      user: { id: "u1" },
      data: await read({ id: "u1" }, { gameHistoryService: { list } }),
    }));
});

describe("HistoryPage", () => {
  it("is dynamic and hands the view the first page of the signed-in account", async () => {
    const html = renderToStaticMarkup(await HistoryPage());

    expect(connection).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledExactlyOnceWith("u1");
    expect(html).toContain("{&quot;entries&quot;:[],&quot;nextCursor&quot;:&quot;abc&quot;}");
  });

  it("sends a visitor without an account to the login with a way back", async () => {
    getCurrentUserWith.mockResolvedValue(null);

    await expect(HistoryPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledExactlyOnceWith("/login?next=%2Fhistory");
  });

  it("is not indexed", async () => {
    const metadata = await generateMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("HistoryPage in French (E15-S05)", () => {
  it("names the page in the request's language", async () => {
    request.lang = "fr";
    expect((await generateMetadata()).title).toBe("Historique des parties — Gomoku");
    request.lang = undefined;
    expect((await generateMetadata()).title).toBe("Historia partii — Gomoku");
  });
});
