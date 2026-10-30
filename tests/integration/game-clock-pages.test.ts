// The clock in two real browsers (E02 phase 4, #23 steps 8-9): it ticks after both players opened
// the game and only for the player on turn, "mało czasu" shows below a minute as colour and a thicker
// outline without any visible text, and a game lost on time is found by both pages with no move made:
// including the page of the player whose own clock ran out. Time is moved by writing `clock_ms_*` and
// `turn_started_at` straight into the database. Screenshots go to $GOMOKU_SHOTS_DIR when it is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const first = new Browser(`${inject("browserSession")}-clock-a`);
const second = new Browser(`${inject("browserSession")}-clock-b`);
const shotsDir = process.env.GOMOKU_SHOTS_DIR;

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  for (const browser of [first, second]) await browser.clearCookies();
});
afterAll(async () => {
  await orm.close();
  for (const browser of [first, second]) {
    await browser.setHeaders({});
    await browser.setMedia("light");
    await browser.clearCookies();
    await browser.close();
  }
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.53.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

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
    email: `clockpage-${n}@example.com`,
    displayName: `Clk_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  return pair;
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const shot = async (browser: Browser, name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}.png`);
};
/** Digits of the two clocks: [opponent's (top), own (bottom)]. */
const digits = (browser: Browser) =>
  browser.evaluate<string[]>("[...document.querySelectorAll('[data-slot=clock] time')].map((time) => time.textContent)");
const lowCount = (browser: Browser) => browser.evaluate<number>("document.querySelectorAll('[data-slot=clock][data-low]').length");
const horizontalOverflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");

type Pair = { gameId: string; black: Browser; white: Browser; blackSeat: 1 | 2 };

/** A game both players have open: the creator is `first`, the joiner `second`; the clock is running. */
async function openGame(): Promise<Pair> {
  const creator = await signedUp(first);
  const created = (await (await api("POST", "/api/games", {}, creator)).json()) as {
    data: { gameId: string; invitation: { code: string } };
  };
  const joiner = await signedUp(second);
  const joined = await api("POST", `/api/invitations/${created.data.invitation.code}/accept`, { as: "user" }, joiner);
  expect(joined.status).toBe(200);
  const gameId = created.data.gameId;
  for (const browser of [first, second]) {
    await browser.setViewport(1280, 900);
    await browser.open(`${baseUrl}/games/${gameId}`);
  }
  for (const browser of [first, second]) await bodyHas(browser, "Partia w toku");
  const [row] = await run(`select black_seat from games where id = ?`, [gameId]);
  const blackSeat = row!.black_seat as 1 | 2;
  // Seat 1 is the creator.
  return { gameId, black: blackSeat === 1 ? first : second, white: blackSeat === 1 ? second : first, blackSeat };
}

describe("the clock on the board", () => {
  it("ticks for the player on turn only, shows 'mało czasu' without text and finds a loss on time with no move", async () => {
    const { gameId, black, white, blackSeat } = await openGame();

    // Started by the second opening of the page: the player on turn (black) loses time, white keeps 10:00.
    await black.waitForFn("document.querySelectorAll('[data-slot=clock] time')[1].textContent !== '10:00'");
    expect((await digits(black))[0]).toBe("10:00");
    await white.waitForFn("document.querySelectorAll('[data-slot=clock] time')[0].textContent !== '10:00'");
    expect((await digits(white))[1]).toBe("10:00");
    const [seenByBlack] = await run(`select turn_started_at is not null as started from games where id = ?`, [gameId]);
    expect(seenByBlack!.started).toBe(true);
    // It keeps counting between two reads of the state (the page polls every 2 s).
    const before = (await digits(black))[1]!;
    await black.waitForFn(`document.querySelectorAll('[data-slot=clock] time')[1].textContent !== ${JSON.stringify(before)}`);
    expect(await lowCount(black)).toBe(0);
    expect(await black.evaluate<string>("document.querySelector('[data-testid=low-live]').textContent")).toBe("");
    await shot(black, "p05-1-zegary-1280-light");

    // Under a minute for black: bright colour and a thick outline on both pages' clock of black, no text.
    await run(`update games set clock_ms_${blackSeat} = 45000, turn_started_at = now() where id = ?`, [gameId]);
    await black.waitForFn("document.querySelectorAll('[data-slot=clock][data-low]').length === 1");
    await white.waitForFn("document.querySelectorAll('[data-slot=clock][data-low]').length === 1");
    expect(await black.evaluate<string>("document.querySelector('[data-testid=low-live]').textContent")).toBe(
      "Zostało mniej niż minuta",
    );
    // The opponent's low clock is not announced to the other player.
    expect(await white.evaluate<string>("document.querySelector('[data-testid=low-live]').textContent")).toBe("");
    for (const browser of [black, white]) {
      expect(await browser.text("main")).not.toMatch(/mało czasu/i);
      const style = await browser.evaluate<{ border: string; digits: string; plain: string }>(`(() => {
        const low = document.querySelector('[data-slot=clock][data-low]');
        const plain = document.querySelector('[data-slot=clock]:not([data-low])');
        return { border: getComputedStyle(low.firstElementChild).borderTopWidth,
          digits: getComputedStyle(low.querySelector('time')).color,
          plain: getComputedStyle(plain.querySelector('time')).color };
      })()`);
      expect(style.border).toBe("4px");
      expect(style.digits).not.toBe(style.plain);
    }
    await shot(black, "p05-3-malo-czasu-1280-light");
    await black.setViewport(360, 800);
    expect(await horizontalOverflow(black)).toBe(false);
    await shot(black, "p05-3-malo-czasu-360-light");
    await black.setMedia("dark");
    await shot(black, "p05-3-malo-czasu-360-dark");
    await black.setViewport(1280, 900);
    await shot(black, "p05-3-malo-czasu-1280-dark");
    await black.setMedia("light");
    // A reload keeps the low state (the server value, not a local leftover).
    await black.open(`${baseUrl}/games/${gameId}`);
    await black.waitForFn("document.querySelectorAll('[data-slot=clock][data-low]').length === 1");

    // The turn began two minutes ago with 45 s on black's clock: nobody moves and nobody asks for a result.
    await run(`update games set turn_started_at = now() - interval '2 minutes' where id = ?`, [gameId]);
    // Black's own page, on black's own turn, finds it too (the page reads the state on the own turn).
    await bodyHas(black, "Przegrałeś — skończył się Twój czas");
    await bodyHas(white, "Wygrałeś — przeciwnikowi skończył się czas");
    for (const browser of [black, white]) {
      await bodyHas(browser, "Koniec partii");
      expect(await browser.evaluate<string>("document.querySelector('[role=grid]').getAttribute('aria-readonly')")).toBe("true");
    }
    expect(await digits(black)).toEqual(["10:00", "0:00"]);
    expect(await digits(white)).toEqual(["0:00", "10:00"]);
    await shot(black, "p06-3-przegrana-na-czas-1280-light");
    await shot(white, "p06-3-wygrana-na-czas-1280-light");
    await black.setViewport(360, 800);
    expect(await horizontalOverflow(black)).toBe(false);
    await shot(black, "p06-3-przegrana-na-czas-360-light");
    await black.setMedia("dark");
    await shot(black, "p06-3-przegrana-na-czas-360-dark");
    await black.setMedia("light");
    await black.setViewport(1280, 900);
    const [ended] = await run(`select status, end_reason, winner_seat from games where id = ?`, [gameId]);
    expect(ended).toMatchObject({ status: "finished", end_reason: "timeout", winner_seat: blackSeat === 1 ? 2 : 1 });
  });

  it("finds a loss on time by the local countdown on the player's own turn, without waiting for the next poll", async () => {
    const { gameId, black, blackSeat } = await openGame();
    await black.waitForFn("document.querySelectorAll('[data-slot=clock] time')[1].textContent !== '10:00'");
    // 2 s left on a turn that has just begun: the countdown reaches zero before or with the next read.
    await run(`update games set clock_ms_${blackSeat} = 2000, turn_started_at = now() where id = ?`, [gameId]);
    await bodyHas(black, "Przegrałeś — skończył się Twój czas");
    expect((await digits(black))[1]).toBe("0:00");
  });
});
