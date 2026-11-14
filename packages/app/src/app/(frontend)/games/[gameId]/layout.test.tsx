import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ lang: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("@/i18n/context", () => ({
  I18nProvider: ({ locale, dicts, children }: { locale?: string; dicts?: Record<string, unknown>; children: React.ReactNode }) => (
    <section data-locale={locale} data-namespaces={Object.keys(dicts ?? {}).join(",")}>
      {children}
    </section>
  ),
}));

import GameLayout from "./layout";

beforeEach(() => {
  request.lang = undefined;
});

describe("the game segment layout (spec Q10)", () => {
  it("passes no catalog in Polish, so the page's payload stays as it was", async () => {
    expect(renderToStaticMarkup(await GameLayout({ children: <p>room</p> }))).toBe('<section data-namespaces=""><p>room</p></section>');
  });

  it("passes `common` for the error boundary in another language", async () => {
    request.lang = "fr";
    expect(renderToStaticMarkup(await GameLayout({ children: <p>room</p> }))).toBe(
      '<section data-locale="fr" data-namespaces="common"><p>room</p></section>',
    );
  });
});
