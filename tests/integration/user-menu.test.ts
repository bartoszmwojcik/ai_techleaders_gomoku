// The top bar (#227): "Gomoku" and the theme switch on the left, the menu of the signed-in player on the right;
// the keyboard path, logout with the confirmation during a running game, and nothing for a guest.
import { mkdirSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(inject("browserSession"));
const MENU = "[data-testid=signed-in-as]";
// Screenshots for a manual review only when asked for.
const SHOTS = process.env.GOMOKU_SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (name: string) => {
  if (SHOTS) await browser.run("screenshot", "--full", `${SHOTS}/${name}.png`);
};

let counter = 0;
const nextAddress = () => `198.71.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

async function api(path: string, body?: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": nextAddress(),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

async function signedUp(prefix = "Menu"): Promise<{ cookie: string; displayName: string }> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const displayName = `${prefix}_${n}`;
  const response = await api("/api/auth/register", {
    email: `menu-${n}@example.com`,
    displayName,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return { cookie: (response.headers.get("set-cookie") ?? "").split(";")[0]!, displayName };
}

async function signIn(cookie: string, theme: "dark" | "light" = "dark") {
  await browser.setCookie(cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", theme, baseUrl);
}

async function startedGame(body: Record<string, unknown>, alice: string) {
  const bob = await signedUp();
  const created = await api("/api/games", body, alice);
  const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
  expect((await api(`/api/invitations/${data.invitation.code}/accept`, { as: "user" }, bob.cookie)).status).toBe(200);
  for (const cookie of [alice, bob.cookie]) await fetch(`${baseUrl}/games/${data.gameId}`, { headers: { cookie } });
  return data.gameId;
}

const items = () =>
  browser.evaluate<string[]>(`[...document.querySelectorAll("[role=menuitem]")].map((e) => e.textContent.trim())`);
const focused = () => browser.evaluate<string | null>(`document.activeElement?.textContent?.trim() ?? null`);
const chooseLogout = async () => {
  await browser.click(MENU);
  await browser.waitFor("[role=menuitem]");
  await browser.click("[role=menuitem]:last-child");
};
const noScroll = () => browser.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth");

beforeEach(async () => {
  await browser.setViewport(1280, 720);
  await browser.clearCookies();
});
afterAll(async () => {
  await browser.setViewport(1280, 720);
  await browser.clearCookies();
});

describe("the top bar", () => {
  it("keeps the name in the right corner, the switch on the left, and only three actions on the home page", async () => {
    const { cookie, displayName } = await signedUp();
    await signIn(cookie);
    await browser.open(`${baseUrl}/`);
    await browser.waitFor(MENU);

    expect(await browser.text(MENU)).toBe(displayName);
    const places = await browser.evaluate<{ link: number; toggle: number; menuRight: number; width: number; href: string | null }>(
      `(() => { const l = document.querySelector("[data-testid=home-link]"); return { link: l.getBoundingClientRect().left, toggle: document.querySelector("[data-testid=theme-switch]").getBoundingClientRect().left, menuRight: document.querySelector("${MENU}").getBoundingClientRect().right, width: document.documentElement.clientWidth, href: l.getAttribute("href") }; })()`,
    );
    expect(places.href).toBe("/");
    expect(places.link).toBeLessThan(places.toggle);
    expect(places.toggle).toBeLessThan(places.width / 2);
    expect(places.menuRight).toBeGreaterThan(places.width / 2);

    const main = await browser.evaluate<string>(`document.querySelector("main").innerText`);
    expect(main).not.toContain("Zalogowano jako");
    expect(await browser.count("main a[href='/account'], main a[href='/history']")).toBe(0);
    expect(main).not.toContain("Wyloguj");
    expect(await browser.count("[data-testid=create-game]")).toBe(1);
    expect(await browser.count("main a[href='/lobby']")).toBe(1);
    expect(await browser.count("main a[href='/join']")).toBe(1);
    await shot("home-desktop-dark");
  });

  it("opens with the mouse and takes the player to the account and the history", async () => {
    const { cookie } = await signedUp();
    await signIn(cookie);
    await browser.open(`${baseUrl}/`);
    await browser.click(MENU);
    await browser.waitFor("[role=menu]");
    expect(await items()).toEqual(["Konto", "Historia", "Wyloguj"]);
    await shot("menu-open-desktop-dark");

    await browser.click("[role=menuitem][href='/history']");
    await browser.waitForFn("location.pathname === '/history'");
    await browser.click(MENU);
    await browser.click("[role=menuitem][href='/account']");
    await browser.waitForFn("location.pathname === '/account'");
  });

  it("works from the keyboard and reads the whole sentence to a screen reader", async () => {
    const { cookie, displayName } = await signedUp();
    await signIn(cookie);
    await browser.open(`${baseUrl}/`);
    await browser.waitFor(MENU);

    const attribute = (name: string) => browser.evaluate<string | null>(`document.querySelector("${MENU}").getAttribute("${name}")`);
    expect(await attribute("aria-label")).toBe(`Zalogowano jako ${displayName}, menu konta`);
    expect(await attribute("aria-haspopup")).toBe("menu");
    expect(await attribute("aria-expanded")).toBe("false");

    await browser.evaluate(`document.querySelector("${MENU}").focus()`);
    await browser.press("Enter");
    await browser.waitFor("[role=menu]");
    expect(await attribute("aria-expanded")).toBe("true");
    await browser.waitForFn(`document.activeElement?.textContent === "Konto"`);
    await browser.press("ArrowDown");
    expect(await focused()).toBe("Historia");

    await browser.press("Escape");
    await browser.waitForFn(`!document.querySelector("[role=menu]")`);
    expect(await focused()).toBe(displayName);

    await browser.press("Space");
    await browser.waitFor("[role=menu]");
    await browser.press("Escape");
  });

  it("logs out at once with no game running and comes back as a guest", async () => {
    const { cookie } = await signedUp();
    await signIn(cookie);
    await browser.open(`${baseUrl}/lobby`);
    await chooseLogout();
    await browser.waitFor("a[href='/register']");

    expect(await browser.url()).toBe(`${baseUrl}/`);
    expect(await browser.count(MENU)).toBe(0);
    await browser.open(`${baseUrl}/account`);
    expect(await browser.url()).toBe(`${baseUrl}/login?next=%2Faccount`);
  });

  it("shows the menu right after signing in, without a reload", async () => {
    const { displayName } = await signedUp();
    await browser.open(`${baseUrl}/login`);
    expect(await browser.count(MENU)).toBe(0);
    await browser.fill("#login-email", `menu-${displayName.slice("Menu_".length)}@example.com`);
    await browser.fill("#login-password", "secret123");
    await browser.click("[data-testid=login-form] button[type=submit]");
    await browser.waitFor(MENU);
    expect(await browser.text(MENU)).toBe(displayName);
  });

  it("asks before logging out of a running game, also when the game started after the bar was rendered", async () => {
    const alice = await signedUp();
    await signIn(alice.cookie);
    // The bar is rendered while the player has no game at all.
    await browser.open(`${baseUrl}/`);
    await browser.waitFor(MENU);
    await startedGame({}, alice.cookie);

    await chooseLogout();
    await browser.waitFor("[role=alertdialog]");
    expect(await browser.text("[role=alertdialog]")).toContain("Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?");

    await browser.press("Escape");
    await browser.waitForFn(`!document.querySelector("[role=alertdialog]")`);
    await browser.waitForFn(`document.activeElement?.dataset?.testid === "signed-in-as"`);
    expect(await browser.count(MENU)).toBe(1);

    await chooseLogout();
    await browser.waitFor("[role=alertdialog]");
    await browser.evaluate(
      `[...document.querySelectorAll("[role=alertdialog] button")].find((b) => b.textContent.trim() === "Wyloguj").click()`,
    );
    await browser.waitFor("a[href='/register']");
    expect(await browser.count(MENU)).toBe(0);
  });

  it("offers a guest no menu and the same page as before", async () => {
    await browser.open(`${baseUrl}/`);
    await browser.waitFor("a[href='/register']");

    expect(await browser.count(MENU)).toBe(0);
    expect(await browser.count("[data-testid=home-link]")).toBe(1);
    expect(await browser.count("[data-testid=theme-switch]")).toBe(1);
    await shot("home-guest-desktop-dark");
  });

  it("cuts a long name and fits 320 px without horizontal scrolling, in both themes", async () => {
    const { cookie, displayName } = await signedUp("Dluga_nazwa_g");
    await browser.setViewport(320, 568);
    for (const theme of ["dark", "light"] as const) {
      await signIn(cookie, theme);
      for (const path of ["/", "/lobby", "/account", "/history"]) {
        await browser.open(`${baseUrl}${path}`);
        await browser.waitFor(MENU);
        expect(await noScroll(), `${theme} ${path}`).toBe(true);
        const box = await browser.evaluate<{ right: number; height: number; toggleRight: number; left: number; cut: boolean }>(
          `(() => { const m = document.querySelector("${MENU}"); const b = m.getBoundingClientRect(); const n = m.querySelector(".truncate"); return { right: b.right, left: b.left, height: b.height, toggleRight: document.querySelector("[data-testid=theme-switch]").getBoundingClientRect().right, cut: n.scrollWidth > n.clientWidth }; })()`,
        );
        expect(box.right).toBeLessThanOrEqual(320);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.left).toBeGreaterThan(box.toggleRight);
        expect(box.cut, displayName).toBe(true);
      }
      await browser.open(`${baseUrl}/`);
      await browser.waitFor(MENU);
      await shot(`home-320-${theme}`);
      await browser.click(MENU);
      await browser.waitFor("[role=menu]");
      expect(await noScroll()).toBe(true);
      await shot(`menu-open-320-${theme}`);
    }
  });

  it("keeps the bar in a game screen of both variants, both themes, at 320 px and on a desktop", async () => {
    const shortName = await signedUp("Ala");
    const paperPlayer = await signedUp("Ola");
    const classic = await startedGame({}, shortName.cookie);
    const paper = await startedGame({ variant: "paper" }, paperPlayer.cookie);
    for (const [label, cookie, gameId] of [
      ["classic", shortName.cookie, classic],
      ["paper", paperPlayer.cookie, paper],
    ] as const) {
      for (const theme of ["dark", "light"] as const) {
        await signIn(cookie, theme);
        for (const [viewport, width, height] of [
          ["320", 320, 568],
          ["desktop", 1280, 720],
        ] as const) {
          await browser.setViewport(width, height);
          await browser.open(`${baseUrl}/games/${gameId}`);
          await browser.waitForFn("document.body.innerText.includes('Partia w toku')");
          expect(await noScroll(), `${label} ${theme} ${viewport}`).toBe(true);
          await shot(`game-${label}-${viewport}-${theme}`);
        }
      }
    }
  });
});
