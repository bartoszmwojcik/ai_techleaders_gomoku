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
}));

import FrontendLayout, { metadata } from "./layout";

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

  it("places the theme switch in the corner with the cookie theme as its server state", async () => {
    const light = await render("light");
    const unset = await render(undefined);

    expect(light).toMatch(/<div class="flex justify-end[^"]*"><button[^>]*><svg[^>]*lucide-sun/);
    expect(unset).toMatch(/<div class="flex justify-end[^"]*"><button[^>]*><svg[^>]*lucide-moon/);
  });

  it("describes the game for search engines", () => {
    expect(metadata).toEqual({
      title: "Gomoku",
      description: expect.stringContaining("plansza 15×15"),
    });
  });
});
