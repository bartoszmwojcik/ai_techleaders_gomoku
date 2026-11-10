import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ lang: undefined as string | undefined, acceptLanguage: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined),
  }),
  headers: async () => new Headers({ "accept-language": request.acceptLanguage }),
}));

vi.mock("@/components/auth/session-menu", () => ({
  SessionMenu: ({ locale, dict }: { locale?: string; dict?: { session: { account: string } } }) => (
    <button data-testid="session-menu">{`${locale ?? "default"}:${dict?.session.account ?? "default"}`}</button>
  ),
}));

import FrontendLayout, { generateMetadata } from "./layout";

beforeEach(() => {
  request.lang = undefined;
  request.acceptLanguage = "";
});

const render = async () => renderToStaticMarkup(await FrontendLayout({ children: <p>page</p> }));

describe("FrontendLayout: language", () => {
  it("renders the document, the header and the description in the cookie's language", async () => {
    request.lang = "fr";
    const html = await render();

    expect(html).toMatch(/^<html lang="fr">/);
    expect(html).toContain('aria-label="Thème sombre"');
    expect(html).toContain('aria-label="Langue : Français, changer de langue"');
    expect(html).toContain('data-testid="session-menu">fr:Compte<');
    expect(await generateMetadata()).toEqual({ title: "Gomoku", description: expect.stringContaining("plateau 15×15") });
  });

  it("hands no texts to the client components in Polish: their defaults are the Polish catalog", async () => {
    const html = await render();

    expect(html).toMatch(/^<html lang="pl">/);
    expect(html).toContain('data-testid="session-menu">default:default<');
    expect(html).toContain('aria-label="Ciemny motyw"');
  });

  it("follows the browser without a cookie and shows the language switch after the theme switch", async () => {
    request.acceptLanguage = "en-GB,en;q=0.9";
    const html = await render();

    expect(html).toMatch(/^<html lang="en">/);
    expect(html.indexOf('data-testid="theme-switch"')).toBeLessThan(html.indexOf('data-testid="language-switch"'));
    expect(html.indexOf('data-testid="language-switch"')).toBeLessThan(html.indexOf('data-testid="session-menu"'));
    expect(html).toContain(">EN<");
    // Below sm the board's heading shares the row with the floating bar: no room for the language menu there.
    const at = html.indexOf('data-testid="language-switch"');
    const trigger = html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at));
    expect(trigger).toContain("group-has-[[data-theme-overlay]]/body:max-sm:hidden");
  });
});
