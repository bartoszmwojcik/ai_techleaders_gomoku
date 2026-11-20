import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ lang: undefined as string | undefined, nonce: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined),
  }),
  headers: async () => new Headers(request.nonce === undefined ? {} : { "x-nonce": request.nonce }),
}));

vi.mock("@/components/auth/session-menu", () => ({
  SessionMenu: () => <button data-testid="session-menu">menu</button>,
}));

import GlobalNotFound, { generateMetadata } from "./global-not-found";

beforeEach(() => {
  request.lang = undefined;
  request.nonce = undefined;
});

describe("GlobalNotFound", () => {
  it("renders a whole player document with a heading and a way home", async () => {
    const html = renderToStaticMarkup(await GlobalNotFound());

    expect(html).toMatch(/^<html lang="pl">/);
    expect(html).toContain('data-testid="session-menu"');
    expect(html).toContain('data-testid="global-not-found"');
    expect(html).toContain("<h1");
    expect(html).toContain("Nie ma takiej strony");
    expect(html).toContain("Ten adres nie prowadzi do żadnej strony Gomoku.");
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Wróć na stronę główną<\/a>/);
  });

  it("puts the proxy's nonce on the inline theme script", async () => {
    request.nonce = "abc123";
    const html = renderToStaticMarkup(await GlobalNotFound());

    expect(html).toContain('<script nonce="abc123">');
  });

  it.each([
    ["en", "Page not found", "Back to the home page"],
    ["fr", "Page introuvable", "Retour à l’accueil"],
    ["de", "Seite nicht gefunden", "Zurück zur Startseite"],
  ])("speaks the request's language (%s)", async (lang, heading, backHome) => {
    request.lang = lang;
    const html = renderToStaticMarkup(await GlobalNotFound());

    expect(html).toContain(`<html lang="${lang}">`);
    expect(html).toContain(heading);
    expect(html).toContain(backHome);
  });
});

describe("generateMetadata", () => {
  it("titles the page in the request's language", async () => {
    expect(await generateMetadata()).toEqual({
      title: "Nie ma takiej strony · Gomoku",
      description: "Gomoku 1:1 online — swobodne zasady, plansza 15×15, zegar 10 minut na gracza.",
    });
    request.lang = "en";
    expect((await generateMetadata()).title).toBe("Page not found · Gomoku");
  });
});
