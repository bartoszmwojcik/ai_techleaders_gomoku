import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, redirect, loadInvitationView } = vi.hoisted(() => ({
  connection: vi.fn(),
  redirect: vi.fn(),
  loadInvitationView: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/http/invitation-view", () => ({ loadInvitationView }));
vi.mock("./invite-screen", () => ({
  InviteScreen: ({ code, view }: { code: string; view: { kind: string } }) => (
    <div data-testid="screen" data-code={code} data-kind={view.kind} />
  ),
}));

import InvitePage, { metadata } from "./page";

const render = async (code: string) => renderToStaticMarkup(await InvitePage({ params: Promise.resolve({ code }) }));

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  loadInvitationView.mockReset().mockResolvedValue({ kind: "joinable", creatorName: "Ala", signedIn: false });
  redirect.mockReset().mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

describe("InvitePage", () => {
  it("does not leak the code through the Referer and stays out of search engines", () => {
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
});
