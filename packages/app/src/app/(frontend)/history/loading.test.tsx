import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ lang: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "gomoku_lang" && request.lang ? { name, value: request.lang } : undefined) }),
  headers: async () => new Headers(),
}));


import HistoryLoading from "./loading";

describe("HistoryLoading", () => {
  it("shows the shape of the page while the history is read", async () => {
    const html = renderToStaticMarkup(await HistoryLoading());

    expect(html).toContain("Historia partii");
    expect(html).toContain("Ładowanie historii partii");
  });
});

beforeEach(() => {
  request.lang = undefined;
});

describe("HistoryLoading in French (E15-S05)", () => {
  it("speaks the request's language", async () => {
    request.lang = "fr";
    expect(renderToStaticMarkup(await HistoryLoading())).toContain("Chargement de l’historique des parties");
  });
});
