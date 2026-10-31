import { describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(inject("browserSession"));

describe("player pages", () => {
  it("shows the home page with a 15×15 board preview", async () => {
    await browser.open(`${baseUrl}/`);

    expect(await browser.title()).toBe("Gomoku");
    expect(await browser.text("h1")).toBe("Gomoku");
    expect(await browser.text("main")).toContain("Pięć w linii wygrywa.");
    expect(await browser.count("[data-testid=board] > div")).toBe(225);
  });

  it("shows the not-found page for an unknown route", async () => {
    const response = await fetch(`${baseUrl}/this-route-does-not-exist`);
    expect(response.status).toBe(404);

    await browser.open(`${baseUrl}/this-route-does-not-exist`);
    expect(await browser.text("body")).toContain("404");
  });
});

describe("admin panel (closed in production until the administrator role, #152)", () => {
  it("answers 404 without a session and does not leak the panel", async () => {
    for (const path of ["/backend", "/backend/anything"]) {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.text();

      expect(response.status).toBe(404);
      expect(body).not.toContain("Panel administracyjny");
      expect(body).not.toContain("Baza danych");
    }
  });
});
