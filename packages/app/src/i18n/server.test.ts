import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  acceptLanguage: null as string | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "gomoku_lang" && request.cookie !== undefined ? { name, value: request.cookie } : undefined),
  }),
  headers: async () => new Headers(request.acceptLanguage === null ? {} : { "accept-language": request.acceptLanguage }),
}));

import { getI18n, getLocale } from "./server";

beforeEach(() => {
  request.cookie = undefined;
  request.acceptLanguage = null;
});

describe("getLocale", () => {
  it("takes a valid cookie first", async () => {
    request.cookie = "en";
    request.acceptLanguage = "fr";
    expect(await getLocale()).toBe("en");
  });

  it("asks the browser when the cookie is missing or forged", async () => {
    request.acceptLanguage = "fr-CA,fr;q=0.9";
    expect(await getLocale()).toBe("fr");
    request.cookie = "../../x";
    expect(await getLocale()).toBe("fr");
  });

  it("is Polish without either", async () => {
    expect(await getLocale()).toBe("pl");
  });
});

describe("getI18n", () => {
  it("returns the language, the complete namespace and a translator", async () => {
    request.cookie = "fr";
    const { locale, dict, t } = await getI18n("header");

    expect(locale).toBe("fr");
    expect(dict.theme.dark).toBe("Thème sombre");
    expect(t("session.menuLabel", { name: "Ala" })).toBe("Connecté en tant que Ala, menu du compte");
  });
});
