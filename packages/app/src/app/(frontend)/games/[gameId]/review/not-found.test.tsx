import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ lang: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));


import ReviewNotFound from "./not-found";

describe("ReviewNotFound", () => {
  it("gives one readable text for a missing, a removed and a foreign game", async () => {
    const html = renderToStaticMarkup(await ReviewNotFound());

    expect(html).toContain("Nie możemy otworzyć tej partii");
    expect(html).toContain("Partia nie istnieje, została usunięta po okresie przechowywania albo nie masz do niej dostępu.");
    expect(html).toContain('href="/history"');
  });
});

beforeEach(() => {
  request.lang = undefined;
});

describe("ReviewNotFound in French (E15-S05)", () => {
  it("speaks the request's language", async () => {
    request.lang = "fr";
    expect(renderToStaticMarkup(await ReviewNotFound())).toContain("Impossible d’ouvrir cette partie");
  });
});
