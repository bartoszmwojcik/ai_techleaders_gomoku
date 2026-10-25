import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FrontendLayout, { metadata } from "./layout";

describe("FrontendLayout", () => {
  it("renders a Polish document with the player theme around the page", () => {
    const html = renderToStaticMarkup(
      <FrontendLayout>
        <p>page content</p>
      </FrontendLayout>,
    );

    expect(html).toMatch(/^<html lang="pl"><head><\/head><body class="[^"]*bg-surface-page[^"]*">/);
    expect(html).toContain("<p>page content</p>");
  });

  it("describes the game for search engines", () => {
    expect(metadata).toEqual({
      title: "Gomoku",
      description: expect.stringContaining("plansza 15×15"),
    });
  });
});
