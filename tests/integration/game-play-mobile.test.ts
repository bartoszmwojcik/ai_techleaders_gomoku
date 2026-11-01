// The board on a phone (#181): "Postaw kamień" is in the first screen without scrolling at 320×568, 360×640 and
// 390×844 in both themes, a tap on a cell only selects (the second tap on the same cell changes nothing) and only
// the button sends the move. With a mouse a click on a cell still places the stone.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const touch = new Browser(`${inject("browserSession")}-mobile-touch`, { touch: true });
const mouse = new Browser(`${inject("browserSession")}-mobile-mouse`);

let counter = 0;
const nextAddress = () => `198.61.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

async function api(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": nextAddress(),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `mobile-${n}@example.com`,
    displayName: `Mobile_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return (response.headers.get("set-cookie") ?? "").split(";")[0]!;
}

type View = { moveCount: number; turnSeat: number | null; you: { seat: number } };
const view = async (gameId: string, cookie: string) =>
  ((await (await api("GET", `/api/games/${gameId}`, undefined, cookie)).json()) as { data: View }).data;

/** A started game of two accounts, both have opened the page (so the board is on); `mover` is on turn. */
async function startedGame() {
  const alice = await signedUp();
  const bob = await signedUp();
  const created = await api("POST", "/api/games", {}, alice);
  const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
  expect((await api("POST", `/api/invitations/${data.invitation.code}/accept`, { as: "user" }, bob)).status).toBe(200);
  for (const cookie of [alice, bob]) await fetch(`${baseUrl}/games/${data.gameId}`, { headers: { cookie } });
  const first = await view(data.gameId, alice);
  return { gameId: data.gameId, mover: first.turnSeat === first.you.seat ? alice : bob };
}

async function visit(browser: Browser, cookie: string, gameId: string, theme: "dark" | "light") {
  const [name, value] = [cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1)];
  await browser.clearCookies();
  await browser.setCookie(name, value, baseUrl);
  await browser.setCookie("gomoku_theme", theme, baseUrl);
  await browser.open(`${baseUrl}/games/${gameId}`);
  await browser.waitForFn("document.body.innerText.includes('Partia w toku')");
}

const CELL = '[aria-label="Kolumna H, rząd 8, puste"]';
const selectCell = (browser: Browser) => browser.evaluate<void>(`document.querySelector('${CELL}').click()`);
const buttonBox = (browser: Browser) =>
  browser.evaluate<{ bottom: number; height: number; innerHeight: number; overflow: boolean }>(
    `(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Postaw kamień")).getBoundingClientRect(); return { bottom: b.bottom, height: b.height, innerHeight: innerHeight, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; })()`,
  );

beforeAll(async () => {
  for (const browser of [touch, mouse]) await browser.clearCookies();
});
afterAll(async () => {
  for (const browser of [touch, mouse]) {
    await browser.clearCookies();
    await browser.close();
  }
});

describe("the board on a phone", () => {
  it("shows 'Postaw kamień' in the first screen, selected or not, in both themes", async () => {
    const { gameId, mover } = await startedGame();
    for (const theme of ["dark", "light"] as const) {
      for (const [width, height] of [
        [320, 568],
        [360, 640],
        [390, 844],
      ] as const) {
        await touch.setViewport(width, height);
        await visit(touch, mover, gameId, theme);
        expect(await touch.evaluate<boolean>("matchMedia('(pointer: coarse)').matches")).toBe(true);
        const label = `${theme} ${width}x${height}`;
        const empty = await buttonBox(touch);
        expect(empty.bottom, `${label}, nothing selected`).toBeLessThanOrEqual(empty.innerHeight);
        expect(empty.overflow, `${label}, horizontal scroll`).toBe(false);
        await selectCell(touch);
        await touch.waitForFn("document.body.innerText.includes('Zaznaczono: Kolumna H, rząd 8')");
        const selected = await buttonBox(touch);
        expect(selected.bottom, `${label}, selected`).toBeLessThanOrEqual(selected.innerHeight);
        expect(selected.height, label).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it("keeps the theme switch off the heading and the board at 320 px", async () => {
    const { gameId, mover } = await startedGame();
    await touch.setViewport(320, 568);
    await visit(touch, mover, gameId, "dark");
    const overlap = await touch.evaluate<boolean>(
      `(() => { const s = document.querySelector("[data-testid=theme-switch]").getBoundingClientRect(); return [...document.querySelectorAll("h1, [role=grid]")].some((e) => { const r = e.getBoundingClientRect(); const t = e.tagName === "H1" ? (() => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); })() : r; return t.left < s.right && t.right > s.left && t.top < s.bottom && t.bottom > s.top; }); })()`,
    );
    expect(overlap).toBe(false);
    const size = await touch.evaluate<{ width: number; height: number }>(
      `(() => { const r = document.querySelector("[data-testid=theme-switch]").getBoundingClientRect(); return { width: r.width, height: r.height }; })()`,
    );
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  });

  it("sends nothing on repeated taps of one cell and plays the move only with the button", async () => {
    const { gameId, mover } = await startedGame();
    await touch.setViewport(390, 844);
    await visit(touch, mover, gameId, "dark");
    for (let tap = 0; tap < 3; tap++) await selectCell(touch);
    await touch.waitForFn("document.body.innerText.includes('Zaznaczono: Kolumna H, rząd 8')");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await view(gameId, mover)).moveCount).toBe(0);
    await touch.run("find", "text", "Postaw kamień", "click");
    await touch.waitForFn("document.querySelectorAll('[aria-label$=\"kamień\"]').length === 1");
    expect((await view(gameId, mover)).moveCount).toBe(1);
  });
});

describe("the board with a mouse", () => {
  it("still places the stone with one click on a cell, with no button", async () => {
    const { gameId, mover } = await startedGame();
    await mouse.setViewport(1280, 900);
    await visit(mouse, mover, gameId, "dark");
    expect(await mouse.evaluate<boolean>("matchMedia('(pointer: coarse)').matches")).toBe(false);
    expect(await mouse.evaluate<boolean>("document.body.innerText.includes('Postaw kamień')")).toBe(false);
    await selectCell(mouse);
    await mouse.waitForFn("document.querySelectorAll('[aria-label$=\"kamień\"]').length === 1");
    expect((await view(gameId, mover)).moveCount).toBe(1);
  });
});
