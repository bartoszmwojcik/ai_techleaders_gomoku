import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ lang: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock("./join-form", () => ({
  JoinForm: ({ locale }: { locale?: string }) => <form data-testid="join-form" data-locale={locale} />,
}));

import JoinPage from "./page";

beforeEach(() => {
  request.lang = undefined;
});

describe("JoinPage", () => {
  it("asks for the code and leads back home", async () => {
    const html = renderToStaticMarkup(await JoinPage());
    expect(html).toContain("Masz kod zaproszenia?</h1>");
    expect(html).toContain('data-testid="join-form"');
    expect(html).toContain('href="/"');
    expect(html).toContain("Wróć na stronę główną");
    expect(html).not.toContain("data-locale");
  });

  it("speaks the request's language and hands it to the form (E15-S03)", async () => {
    request.lang = "fr";
    const html = renderToStaticMarkup(await JoinPage());
    expect(html).toContain("Vous avez un code d’invitation ?</h1>");
    expect(html).toContain('data-locale="fr"');
    expect(html).toContain("Retour à l’accueil");
  });
});
