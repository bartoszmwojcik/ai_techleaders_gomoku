import { themeInitScript } from "@gomoku/core/theme/theme";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({
  value: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "gomoku_theme" && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/components/auth/session-menu", () => ({
  SessionMenu: () => <button data-testid="session-menu">menu</button>,
}));

import FrontendLayout, { generateMetadata } from "./layout";

async function render(cookie: string | undefined) {
  cookieStore.value = cookie;
  return renderToStaticMarkup(
    await FrontendLayout({ children: <p>page content</p> }),
  );
}

describe("FrontendLayout", () => {
  it("renders a Polish document with the player theme around the page", async () => {
    const html = await render(undefined);

    expect(html).toMatch(/^<html lang="pl"><head>/);
    expect(html).toMatch(/<body class="[^"]*bg-surface-page[^"]*">/);
    expect(html).toContain("<p>page content</p>");
  });

  it.each(["dark", "light"])(
    "sets data-theme=%s from the cookie without the init script",
    async (theme) => {
      const html = await render(theme);

      expect(html).toContain(`<html lang="pl" data-theme="${theme}">`);
      expect(html).not.toContain("<script");
    },
  );

  it.each([undefined, "blue", ""])(
    "adds the init script and no attribute for cookie %j",
    async (cookie) => {
      const html = await render(cookie);

      expect(html).toContain('<html lang="pl">');
      expect(html).not.toContain("data-theme=");
      expect(html).toContain(`<script>${themeInitScript}</script>`);
    },
  );

  it("puts the home link and the theme switch on the left, with the cookie theme as the switch's server state", async () => {
    const light = await render("light");
    const unset = await render(undefined);

    for (const html of [light, unset]) {
      expect(html).toMatch(/<header class="flex items-center justify-between[^"]*"><div[^>]*><a [^>]*href="\/"[^>]*>Gomoku<\/a><button/);
      expect(html).toContain('data-testid="home-link"');
      expect(html).toContain("min-h-target");
    }
    expect(light).toMatch(/<button[^>]*><svg[^>]*lucide-sun/);
    expect(unset).toMatch(/<button[^>]*><svg[^>]*lucide-moon/);
  });

  it("puts the session menu on the right, apart from the theme switch", async () => {
    const html = await render("dark");

    expect(html.indexOf('data-testid="theme-switch"')).toBeLessThan(html.indexOf('data-testid="session-menu"'));
    expect(html).toMatch(/<\/button><\/div><div class="flex min-w-0 justify-end[^"]*"><button data-testid="session-menu"/);
  });

  it("lets the bar float over the heading's row below sm only for a page that marks its main, without the home link (issue 181)", async () => {
    const html = await render("dark");

    expect(html).toMatch(/<body class="group\/body /);
    expect(html).toContain("group-has-[[data-theme-overlay]]/body:max-sm:absolute");
    expect(html).toContain("group-has-[[data-theme-overlay]]/body:max-sm:hidden");
    expect(html).toContain("group-has-[[data-theme-overlay]]/body:max-sm:max-w-28");
  });

  it("describes the game for search engines", async () => {
    expect(await generateMetadata()).toEqual({
      title: "Gomoku",
      description: expect.stringContaining("plansza 15×15"),
    });
  });
});
