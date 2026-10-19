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

describe("admin panel", () => {
  it("is connected to the database and shows the game rules", async () => {
    await browser.open(`${baseUrl}/backend`);

    expect(await browser.title()).toBe("Przegląd — Panel Gomoku");
    expect(await browser.text("h1")).toBe("Panel administracyjny");
    expect(await browser.text("[data-slot=badge]")).toBe("Połączono");
    expect(await browser.text("table")).toMatch(/Rozmiar planszy\s*15×15/);
  });
});
