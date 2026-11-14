import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getCurrentUser, request } = vi.hoisted(() => ({
  connection: vi.fn(),
  getCurrentUser: vi.fn(),
  request: { lang: undefined as string | undefined },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));
vi.mock("@/server/http/bot-availability", () => ({ isBotEnabled: async () => true }));
vi.mock("./guest-create-form", () => ({
  GuestCreateForm: ({ botEnabled, locale }: { botEnabled?: boolean; locale?: string }) => (
    <form data-testid="guest-form" data-bot={String(botEnabled)} data-locale={locale ?? "default"} />
  ),
}));

import PlayPage, { generateMetadata } from "./page";

beforeEach(() => {
  request.lang = undefined;
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
    expect(html).toContain('data-bot="true"');
    expect((await generateMetadata()).title).toBe("Zagraj ze znajomym bez konta — Gomoku");
  });

  it("sends a signed-in user to the home page, without the form", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    const html = renderToStaticMarkup(await PlayPage());
    expect(html).toContain("Jesteś zalogowany");
    expect(html).toContain("Utwórz zaproszenie");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("guest-form");
  });

  it("speaks the request's language and hands it to the form, nothing in Polish (E15-S03)", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(renderToStaticMarkup(await PlayPage())).toContain('data-locale="default"');

    request.lang = "fr";
    const html = renderToStaticMarkup(await PlayPage());
    expect(html).toContain("Jouer avec un ami sans compte</h1>");
    expect(html).toContain('data-locale="fr"');
    expect((await generateMetadata()).title).toBe("Jouer avec un ami sans compte — Gomoku");

    getCurrentUser.mockResolvedValue({ id: "u1" });
    expect(renderToStaticMarkup(await PlayPage())).toContain("Vous êtes connecté");
  });
});
