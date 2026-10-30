// The board in two real browsers (E02 phase 3, #22 steps 12-14): the creator (an account) and a
// guest play on /games/[gameId] in turns up to five in a row, the winning line shows, a move out of
// turn is refused and a reload in the middle of the game keeps the board.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const creator = new Browser(`${inject("browserSession")}-play-creator`);
const guest = new Browser(`${inject("browserSession")}-play-guest`);

beforeAll(async () => {
  for (const browser of [creator, guest]) await browser.clearCookies();
});
afterAll(async () => {
  for (const browser of [creator, guest]) {
    await browser.setHeaders({});
    await browser.clearCookies();
    await browser.close();
  }
});

let counter = 0;
const nextAddress = () => `198.52.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
async function visitor(browser: Browser) {
  await browser.setHeaders({ "x-forwarded-for": nextAddress() });
  await browser.clearCookies();
}

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

async function signedUp(browser: Browser) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `play-${n}@example.com`,
    displayName: `Play_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  return pair;
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const click = (browser: Browser, text: string, exact = false) =>
  browser.run("find", "text", text, "click", ...(exact ? ["--exact"] : []));
const cellSelector = (column: string, row: number, state = "puste") => `[aria-label="Kolumna ${column}, rząd ${row}, ${state}"]`;
const stones = (browser: Browser) =>
  browser.evaluate<number>("document.querySelectorAll('[aria-label$=\"kamień\"]').length");
const horizontalOverflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");

describe("the board", () => {
  it("plays a game to five in a row in two browsers, with a move out of turn refused and a reload in the middle", async () => {
    await visitor(creator);
    await visitor(guest);
    const cookie = await signedUp(creator);
    await creator.open(`${baseUrl}/`);
    await creator.waitFor("[data-testid=create-game]");
    await creator.click("[data-testid=create-game]");
    await bodyHas(creator, "Czekamy na przeciwnika…");
    const gamePath = new URL(await creator.url()).pathname;
    const gameId = gamePath.split("/").pop()!;
    const code = await creator.evaluate<string>("document.querySelectorAll('dd')[1].textContent");

    await guest.open(`${baseUrl}/invite/${code}`);
    await guest.waitFor("[data-testid=invite-page]");
    await click(guest, "Graj jako gość");
    // The nickname field pushes the button below the default viewport.
    await guest.setViewport(1280, 900);
    await click(guest, "Rozumiem, graj jako gość");
    await guest.waitForFn("location.pathname.startsWith('/games/')");

    // Both opened the page: the board takes over, one of them draws black.
    await bodyHas(creator, "Partia w toku");
    await bodyHas(guest, "Partia w toku");
    expect(await creator.count("[role=grid] [role=row]")).toBe(15);
    expect(await guest.text("main")).toContain("Grasz bez konta");
    const creatorIsBlack = (await creator.text("main")).includes("Twój ruch (czarne)");
    const [black, white] = creatorIsBlack ? [creator, guest] : [guest, creator];
    await bodyHas(black, "Twój ruch (czarne)");
    await bodyHas(white, "Ruch przeciwnika");
    expect(await white.text("main")).toContain("Grasz białymi.");

    // Out of turn: the board is read-only, the click sends nothing.
    expect(await white.evaluate<string>("document.querySelector('[role=grid]').getAttribute('aria-readonly')")).toBe("true");
    await white.click(cellSelector("A", 1));
    const state = async () =>
      ((await (await api("GET", `/api/games/${gameId}`, undefined, cookie)).json()) as { data: { moveCount: number; turnSeat: number } }).data;
    expect((await state()).moveCount).toBe(0);
    expect(await stones(white)).toBe(0);

    const blackCells = ["A", "B", "C", "D", "E"].map((column) => cellSelector(column, 8));
    const whiteCells = ["A", "B", "C", "D"].map((column) => cellSelector(column, 10));
    for (let move = 0; move < 9; move++) {
      const mover = move % 2 === 0 ? black : white;
      const other = move % 2 === 0 ? white : black;
      const cell = (move % 2 === 0 ? blackCells : whiteCells)[Math.floor(move / 2)]!;
      await bodyHas(mover, "Twój ruch");
      await mover.click(cell);
      if (move < 8) await bodyHas(mover, "Ruch przeciwnika");
      // The opponent's page polls every 2 s and shows the stone.
      await other.waitForFn(`document.querySelectorAll('[aria-label$="kamień"]').length === ${move + 1}`);
      if (move === 3) {
        // A reload in the middle of the game keeps the board.
        await creator.open(`${baseUrl}${gamePath}`);
        await creator.waitFor("[role=grid]");
        expect(await stones(creator)).toBe(4);
        expect(await creator.text("main")).toContain(creatorIsBlack ? "Grasz czarnymi." : "Grasz białymi.");
      }
    }

    // The fifth black stone wins: banner, the winning line and a board that cannot be played any more.
    await bodyHas(black, "Wygrałeś");
    await bodyHas(white, "Przegrałeś");
    for (const browser of [black, white]) {
      await bodyHas(browser, "Koniec partii");
      expect(await browser.evaluate<number>("document.querySelectorAll('[role=gridcell] span.outline-4').length")).toBe(5);
      expect(await browser.evaluate<string>("document.querySelector('[role=grid]').getAttribute('aria-readonly')")).toBe("true");
      expect(await browser.text("main")).toContain("Wróć do panelu głównego");
    }
    expect((await state())).toMatchObject({ moveCount: 9, turnSeat: null });

    // Coming back after the end shows the same result; at 360 px nothing scrolls sideways.
    await black.open(`${baseUrl}${gamePath}`);
    await bodyHas(black, "Wygrałeś");
    expect(await stones(black)).toBe(9);
    for (const browser of [black, white]) {
      await browser.setViewport(360, 800);
      expect(await horizontalOverflow(browser)).toBe(false);
      await browser.setViewport(1280, 800);
    }
  });
});
