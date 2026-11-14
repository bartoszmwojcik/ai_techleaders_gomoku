import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ lang: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));

import GameError from "./error";
import GameNotFound from "./not-found";

beforeEach(() => {
  request.lang = undefined;
});


describe("the error states of the game page", () => {
  it("shows the one 404 text (p07.2)", async () => {
    const html = renderToStaticMarkup(await GameNotFound());
    expect(html).toContain("Ta partia nie istnieje albo nie masz do niej dostępu");
  });

  it("offers a retry when the server does not answer (p07.4)", () => {
    const html = renderToStaticMarkup(<GameError error={new Error("x")} retry={() => {}} />);
    expect(html).toContain("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    expect(html).toContain("Spróbuj ponownie</button>");
    expect(html).toContain("Wróć na stronę główną");
    expect(html).not.toContain("x</");
  });
});

describe("the 404 of the game page in French (E15-S04)", () => {
  it("speaks the request's language", async () => {
    request.lang = "fr";
    expect(renderToStaticMarkup(await GameNotFound())).toContain("Cette partie n’existe pas ou vous n’y avez pas accès");
  });
});
