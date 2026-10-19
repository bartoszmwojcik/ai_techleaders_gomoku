import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BackendLayout, { metadata } from "./layout";

describe("BackendLayout", () => {
  it("renders a Polish document around the panel page", () => {
    const html = renderToStaticMarkup(
      <BackendLayout>
        <p>panel content</p>
      </BackendLayout>,
    );

    expect(html).toBe('<html lang="pl"><head></head><body class="min-h-svh antialiased"><p>panel content</p></body></html>');
  });

  it("titles panel pages and keeps them out of search engines", () => {
    expect(metadata).toEqual({
      title: { default: "Panel — Gomoku", template: "%s — Panel Gomoku" },
      robots: { index: false, follow: false },
    });
  });
});
