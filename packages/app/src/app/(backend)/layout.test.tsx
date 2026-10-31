import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import BackendLayout, { metadata } from "./layout";

afterEach(() => vi.unstubAllEnvs());

describe("BackendLayout", () => {
  it("answers 404 in production, without rendering the panel", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => renderToStaticMarkup(<BackendLayout><p>panel content</p></BackendLayout>)).toThrow(
      "NEXT_NOT_FOUND",
    );
  });

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
