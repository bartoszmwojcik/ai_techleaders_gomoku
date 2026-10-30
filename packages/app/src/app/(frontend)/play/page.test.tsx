import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUser } = vi.hoisted(() => ({ connection: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));
vi.mock("./guest-create-form", () => ({ GuestCreateForm: () => <form data-testid="guest-form" /> }));

import PlayPage, { metadata } from "./page";

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset();
});

describe("PlayPage", () => {
  it("shows the form to a visitor", async () => {
    getCurrentUser.mockResolvedValue(null);
    const html = renderToStaticMarkup(await PlayPage());
    expect(connection).toHaveBeenCalledOnce();
    expect(html).toContain("Zagraj ze znajomym bez konta</h1>");
    expect(html).toContain('data-testid="guest-form"');
    expect(metadata.title).toBe("Zagraj ze znajomym bez konta — Gomoku");
  });

  it("sends a signed-in user to the home page, without the form", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    const html = renderToStaticMarkup(await PlayPage());
    expect(html).toContain("Jesteś zalogowany");
    expect(html).toContain("Utwórz zaproszenie");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("guest-form");
  });
});
