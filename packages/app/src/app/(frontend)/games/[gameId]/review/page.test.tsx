import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, notFound, redirect, getCurrentUserWith, open } = vi.hoisted(() => ({
  connection: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  getCurrentUserWith: vi.fn(),
  open: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/server/http/auth", () => ({ getCurrentUserWith }));
vi.mock("./review-view", () => ({
  ReviewView: (props: { review: { gameId: string }; back: { href: string; label: string } }) => (
    <div data-testid="view" data-id={props.review.gameId} data-back={props.back.href} data-label={props.back.label} />
  ),
}));

import ReviewPage, { metadata } from "./page";

const ID = "0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978";
const render = async (gameId = ID) => renderToStaticMarkup(await ReviewPage({ params: Promise.resolve({ gameId }) }));

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  open.mockReset().mockResolvedValue({ gameId: ID });
  notFound.mockReset().mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  redirect.mockReset().mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  getCurrentUserWith
    .mockReset()
    .mockImplementation(async (read: (user: unknown, cradle: unknown) => unknown) => ({
      user: { id: "u1" },
      data: await read({ id: "u1" }, { gameReviewService: { open } }),
    }));
});

describe("ReviewPage", () => {
  it("is dynamic, keeps out of search engines and opens the game as the signed-in account", async () => {
    const html = await render();

    expect(connection).toHaveBeenCalledOnce();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(open).toHaveBeenCalledExactlyOnceWith({ kind: "account", userId: "u1" }, ID);
    expect(html).toContain(`data-id="${ID}"`);
    expect(html).toContain('data-back="/history"');
    expect(html).toContain('data-label="Wróć do historii"');
  });

  it("answers 404 for a game nobody may read, without asking who", async () => {
    open.mockResolvedValue(null);

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers 404 for a malformed id before it reads the session", async () => {
    await expect(render("not-a-uuid")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(getCurrentUserWith).not.toHaveBeenCalled();
  });

  it("sends a visitor without an account to the login with a way back", async () => {
    getCurrentUserWith.mockResolvedValue(null);

    await expect(render()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/login?next=${encodeURIComponent(`/games/${ID}/review`)}`);
  });
});
