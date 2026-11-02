import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/server/http/admin-gate", () => ({ requireAdmin }));

import BackendLayout, { metadata } from "./layout";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ id: "u-1" });
});

describe("BackendLayout", () => {
  it("answers 404 for a non-administrator, without rendering the panel", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(BackendLayout({ children: <p>panel content</p> })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders a Polish document around the panel page for the administrator", async () => {
    const html = renderToStaticMarkup(await BackendLayout({ children: <p>panel content</p> }));

    expect(html).toBe('<html lang="pl"><head></head><body class="min-h-svh antialiased"><p>panel content</p></body></html>');
  });

  it("titles panel pages and keeps them out of search engines", () => {
    expect(metadata).toEqual({
      title: { default: "Panel — Gomoku", template: "%s — Panel Gomoku" },
      robots: { index: false, follow: false },
    });
  });
});
