import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser, DEFAULT_SYSTEM_SCHEME } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(inject("browserSession"));

const SWITCH = "[data-testid=theme-switch]";
const theme = () => browser.evaluate<string | null>("document.documentElement.dataset.theme ?? null");
// The switch names the theme that is on ("Jasny motyw" / "Ciemny motyw"), with the sun or the moon.
const label = () => browser.evaluate<string | null>(`document.querySelector("${SWITCH}").innerText`);
// Perceived brightness (0..255) of the page background: light themes are bright, dark ones are not.
const brightness = () =>
  browser.evaluate<number>(
    `(() => { const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/[\\d.]+/g).map(Number); return (r * 299 + g * 587 + b * 114) / 1000; })()`,
  );
const themeCookie = async () => (await browser.cookies()).find((cookie) => cookie.name === "gomoku_theme");
const rawHtml = async (cookie?: string) =>
  (await fetch(`${baseUrl}/`, { headers: cookie ? { cookie } : {} })).text();

beforeEach(async () => {
  await browser.clearCookies();
  await browser.setMedia("dark");
  await browser.setViewport(1280, 800);
});

afterAll(async () => {
  await browser.clearCookies();
  // The session is shared with the other files: leave the system preference as global-setup set it.
  await browser.setMedia(DEFAULT_SYSTEM_SCHEME);
  await browser.setViewport(1280, 800);
});

describe("theme switch: first visit without a cookie", () => {
  it("follows a light system preference from the first paint and renders the init script", async () => {
    await browser.setMedia("light");
    await browser.open(`${baseUrl}/`);

    expect(await theme()).toBe("light");
    expect(await brightness()).toBeGreaterThan(200);
    expect(await label()).toBe("Jasny motyw");
    // The choice is not stored until the player clicks.
    expect(await themeCookie()).toBeUndefined();
  });

  it("stays dark with a dark system preference", async () => {
    await browser.setMedia("dark");
    await browser.open(`${baseUrl}/`);

    expect(await theme()).toBeNull();
    expect(await brightness()).toBeLessThan(80);
    expect(await label()).toBe("Ciemny motyw");
  });

  // No-flash guarantee: a synchronous inline script in <head>, before <body>, sets the theme
  // before the first paint. This test checks the order in the raw HTML (and the state after load
  // in the tests above); it does not observe the first paint itself.
  it("ships the init script only without a valid cookie, before the body", async () => {
    const none = await rawHtml();
    expect(none).toMatch(/<html lang="pl"(?![^>]*data-theme)/);
    expect(none).toContain("matchMedia(\"(prefers-color-scheme: light)\")");
    expect(none.indexOf("matchMedia")).toBeLessThan(none.indexOf("<body"));

    const invalid = await rawHtml("gomoku_theme=blue");
    expect(invalid).not.toMatch(/<html[^>]*data-theme/);
    expect(invalid).toContain("matchMedia(\"(prefers-color-scheme: light)\")");
  });

  it("renders the theme from the cookie on the server, without the init script", async () => {
    for (const value of ["light", "dark"]) {
      const html = await rawHtml(`gomoku_theme=${value}`);
      expect(html).toMatch(new RegExp(`<html[^>]*data-theme="${value}"`));
      expect(html).not.toContain("matchMedia");
    }
  });
});

describe("theme switch: choosing a theme", () => {
  it("toggles on click, stores a correct cookie, keeps focus and survives a reload", async () => {
    await browser.setMedia("dark");
    await browser.open(`${baseUrl}/`);
    expect(await label()).toBe("Ciemny motyw");

    await browser.click(SWITCH);
    expect(await theme()).toBe("light");
    expect(await label()).toBe("Jasny motyw");
    expect(await brightness()).toBeGreaterThan(200);
    expect(
      await browser.evaluate<boolean>(`document.activeElement === document.querySelector("${SWITCH}")`),
    ).toBe(true);

    const cookie = await themeCookie();
    expect(cookie).toMatchObject({ value: "light", path: "/", sameSite: "Lax", httpOnly: false });
    // Max-Age of one year.
    const remaining = cookie!.expires - Date.now() / 1000;
    expect(remaining).toBeGreaterThan(364 * 86_400);
    expect(remaining).toBeLessThanOrEqual(365 * 86_400 + 60);

    await browser.open(`${baseUrl}/`);
    expect(await theme()).toBe("light");
    expect(await label()).toBe("Jasny motyw");

    await browser.click(SWITCH);
    expect(await theme()).toBe("dark");
    expect((await themeCookie())?.value).toBe("dark");
    expect(await label()).toBe("Ciemny motyw");
    expect(await brightness()).toBeLessThan(80);
  });

  it("lets the cookie win over the system preference", async () => {
    await browser.setMedia("light");
    await browser.setCookie("gomoku_theme", "dark", baseUrl);
    await browser.open(`${baseUrl}/`);
    expect(await theme()).toBe("dark");
    expect(await brightness()).toBeLessThan(80);

    await browser.setMedia("dark");
    await browser.setCookie("gomoku_theme", "light", baseUrl);
    await browser.open(`${baseUrl}/`);
    expect(await theme()).toBe("light");
    expect(await brightness()).toBeGreaterThan(200);
  });

  it("ignores an invalid cookie value and falls back to the system preference", async () => {
    await browser.setMedia("light");
    await browser.setCookie("gomoku_theme", "blue", baseUrl);
    await browser.open(`${baseUrl}/`);
    expect(await theme()).toBe("light");

    await browser.setMedia("dark");
    await browser.open(`${baseUrl}/`);
    expect(await theme()).toBeNull();
    expect(await label()).toBe("Ciemny motyw");
  });

  it("keeps the choice across player pages", async () => {
    await browser.open(`${baseUrl}/`);
    await browser.click(SWITCH);
    expect(await theme()).toBe("light");

    for (const path of ["/login", "/register", "/forgot-password"]) {
      await browser.open(`${baseUrl}${path}`);
      expect(await theme(), path).toBe("light");
      expect(await label(), path).toBe("Jasny motyw");
      expect(await brightness(), path).toBeGreaterThan(200);
    }
  });
});

describe("theme switch: keyboard and layout", () => {
  it("is reachable with Tab and toggles with Enter and Space, focus stays on the button", async () => {
    await browser.open(`${baseUrl}/`);
    // The switch is the first focusable element of every page.
    await browser.press("Tab");
    const isSwitchFocused = `document.activeElement === document.querySelector("${SWITCH}")`;
    expect(await browser.evaluate<boolean>(isSwitchFocused)).toBe(true);

    await browser.press("Enter");
    expect(await theme()).toBe("light");
    expect(await browser.evaluate<boolean>(isSwitchFocused)).toBe(true);

    await browser.press("Space");
    expect(await theme()).toBe("dark");
    expect(await browser.evaluate<boolean>(isSwitchFocused)).toBe(true);
    expect((await themeCookie())?.value).toBe("dark");
  });

  it("fits at 360 px: 44 px target, no horizontal scroll, no overlap with the content", async () => {
    await browser.setViewport(360, 740);
    for (const path of ["/", "/login", "/register"]) {
      await browser.open(`${baseUrl}${path}`);
      const layout = await browser.evaluate<{
        scrollWidth: number;
        width: number;
        height: number;
        right: number;
        bottom: number;
        mainTop: number;
      }>(
        `(() => { const b = document.querySelector("${SWITCH}").getBoundingClientRect(); return { scrollWidth: document.documentElement.scrollWidth, width: b.width, height: b.height, right: b.right, bottom: b.bottom, mainTop: document.querySelector("main").getBoundingClientRect().top }; })()`,
      );
      expect(layout.scrollWidth, path).toBeLessThanOrEqual(360);
      expect(layout.width, path).toBeGreaterThanOrEqual(44);
      expect(layout.height, path).toBeGreaterThanOrEqual(44);
      expect(layout.right, path).toBeLessThanOrEqual(360);
      expect(layout.mainTop, path).toBeGreaterThanOrEqual(layout.bottom);
    }
  });
});
