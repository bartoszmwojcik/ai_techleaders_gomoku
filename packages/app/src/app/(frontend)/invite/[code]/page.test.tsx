import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, redirect, loadInvitationView, request } = vi.hoisted(() => ({
  request: { lang: undefined as string | undefined },
  connection: vi.fn(),
  redirect: vi.fn(),
  loadInvitationView: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/http/invitation-view", () => ({ loadInvitationView }));
vi.mock("./invite-screen", () => ({
  InviteScreen: ({ code, view, texts, commonTexts }: { code: string; view: { kind: string }; texts: { locale?: string }; commonTexts: { locale?: string } }) => (
    <div data-testid="screen" data-code={code} data-kind={view.kind} data-locale={texts.locale} data-common={commonTexts.locale} />
  ),
}));

import InvitePage, { generateMetadata } from "./page";

const render = async (code: string) => renderToStaticMarkup(await InvitePage({ params: Promise.resolve({ code }) }));

beforeEach(() => {
  request.lang = undefined;
  connection.mockReset().mockResolvedValue(undefined);
  loadInvitationView.mockReset().mockResolvedValue({ kind: "joinable", creatorName: "Ala", signedIn: false });
  redirect.mockReset().mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("InvitePage", () => {
  it("does not leak the code through the Referer and stays out of search engines", async () => {
    const metadata = await generateMetadata();
    expect(metadata.referrer).toBe("no-referrer");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("is dynamic and shows the display form of the code", async () => {
    const html = await render("abcdefgh");
    expect(connection).toHaveBeenCalledOnce();
    expect(loadInvitationView).toHaveBeenCalledWith("abcdefgh");
    expect(html).toContain('data-code="ABCD-EFGH"');
    expect(html).toContain('data-kind="joinable"');
  });

  it("passes no code on when the one in the address is malformed", async () => {
    loadInvitationView.mockResolvedValue({ kind: "invalid" });
    expect(await render("x")).toContain('data-code=""');
  });

  it("sends a player of the game to the game page", async () => {
    loadInvitationView.mockResolvedValue({ kind: "redirect", gameId: "g1" });
    await expect(render("ABCD-EFGH")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/games/g1");
  });

  it("sends anybody with the code of a finished public game to its review", async () => {
    loadInvitationView.mockResolvedValue({ kind: "review", gameId: "g1" });
    await expect(render("abcd-efgh")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/games/g1/review?code=ABCDEFGH");
  });
});

describe("InvitePage in French (E15-S03)", () => {
  it("names the page and hands both namespaces to the screen, nothing in Polish", async () => {
    expect(await render("abcdefgh")).not.toContain("data-locale");
    request.lang = "fr";
    expect(await render("abcdefgh")).toContain('data-locale="fr" data-common="fr"');
    expect((await generateMetadata()).title).toBe("Invitation à une partie — Gomoku");
  });
});
