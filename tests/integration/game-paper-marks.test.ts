// The marks of the paper game in a real browser: × for black, ○ for white, on the sheet and at the names, with the
// words to match. A public game of two accounts goes through a five, the automat and the end on points; the players,
// a spectator and the review all speak of "krzyżyk" and "kółko", never of colours or stones. The toolbar word stays
// inside its button and nothing scrolls sideways at 320 px, at the smallest and the largest zoom.
// Screenshots go to $GOMOKU_SHOTS_DIR when the variable is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const mouse = new Browser(`${inject("browserSession")}-marks-mouse`);
const touch = new Browser(`${inject("browserSession")}-marks-touch`, { touch: true });
const shotsDir = process.env.GOMOKU_SHOTS_DIR;

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  for (const browser of [mouse, touch]) await browser.clearCookies();
});
afterAll(async () => {
  await orm.close();
  for (const browser of [mouse, touch]) {
    await browser.clearCookies();
    await browser.close();
  }
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, unknown>[]>(text, params);

let counter = 0;
const nextAddress = () => `198.73.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
const call = (method: "GET" | "POST", path: string, body?: unknown, cookie?: string) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress(), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await call("POST", "/api/auth/register", { email: `marks-${n}@example.com`, displayName: `Znak_${n}`, password: "secret123" });
  expect(response.status).toBe(201);
  return (response.headers.get("set-cookie") ?? "").split(";")[0]!;
}

async function startedGame() {
  const creator = await signedUp();
  const joiner = await signedUp();
  const created = await call("POST", "/api/games", { variant: "paper", timeControlMs: 60_000, isPublic: true }, creator);
  expect(created.status).toBe(201);
  const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
  expect((await call("POST", `/api/invitations/${data.invitation.code}/accept`, { as: "user" }, joiner)).status).toBe(200);
  const [row] = await run(`select black_seat from games where id = ?`, [data.gameId]);
  expect((await call("GET", `/api/games/${data.gameId}`, undefined, creator)).status).toBe(200);
  const creatorBlack = row!.black_seat === 1;
  return { gameId: data.gameId, code: data.invitation.code, black: creatorBlack ? creator : joiner, white: creatorBlack ? joiner : creator };
}
type Game = Awaited<ReturnType<typeof startedGame>>;

const play = async (game: Game, side: "black" | "white", x: number, y: number, moveNumber: number) => {
  const response = await call("POST", `/api/games/${game.gameId}/moves`, { x, y, moveNumber }, game[side]);
  expect(response.status, `move ${moveNumber} at ${x},${y}`).toBe(200);
};
/** Black's five on y=50 against white's four on y=52: 9 moves, black leads 1 : 0, white on turn. */
async function blackFive(game: Game): Promise<number> {
  let n = 1;
  for (let i = 0; i < 4; i += 1) {
    await play(game, "black", 50 + i, 50, n++);
    await play(game, "white", 50 + i, 52, n++);
  }
  await play(game, "black", 54, 50, n++);
  return n;
}
/** Pretends the current turn began `seconds` ago: the clock of the player on turn runs out. */
const turnBegan = (game: Game, seconds: number) =>
  run(`update games set turn_started_at = now() - make_interval(secs => ?) where id = ?`, [seconds, game.gameId]);

const LEVEL_KEY = "gomoku.paper-board.level";
async function visit(browser: Browser, cookie: string | null, path: string, theme: "dark" | "light", level?: number) {
  await browser.clearCookies();
  if (cookie) await browser.setCookie(cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", theme, baseUrl);
  await browser.open(`${baseUrl}${path}`);
  if (level !== undefined) {
    await browser.evaluate(`localStorage.setItem(${JSON.stringify(LEVEL_KEY)}, "${level}")`);
    await browser.open(`${baseUrl}${path}`);
  }
}

const NO_COLOUR_OR_STONE = /kamie|czarn|biał|kolor/i;
const MAIN_TEXT = "document.querySelector('main').innerText";
const textOf = (browser: Browser) => browser.evaluate<string>(MAIN_TEXT);
const bodyHas = (browser: Browser, text: string) => browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const overflows = (browser: Browser) => browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const shot = async (browser: Browser, name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}.png`);
};
const marksOnSheet = (browser: Browser, shape: "path" | "circle") => browser.count(`[role=grid] svg ${shape}`);
/** How far the word of the centre button leaves its frame, and which toolbar buttons it hits. */
const centreButton = (browser: Browser) =>
  browser.evaluate<{ spill: number; hits: number; height: number }>(
    `(() => {
      const bar = document.querySelector("[role=toolbar]");
      const all = [...bar.querySelectorAll("button")];
      const center = all.find((b) => b.textContent.trim() === "Wyśrodkuj");
      const c = center.getBoundingClientRect();
      const hits = all.filter((b) => b !== center).filter((b) => { const r = b.getBoundingClientRect(); return r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top; }).length;
      return { spill: center.scrollWidth - center.clientWidth, hits, height: c.height };
    })()`,
  );

describe("the marks of the paper game", () => {
  it("shows × and ○ with matching words to the players, a spectator and the review, in both themes and every size", async () => {
    const game = await startedGame();
    await blackFive(game);

    // The player of × sees it on the sheet and at the name; the five is struck through.
    for (const theme of ["dark", "light"] as const) {
      for (const [width, height, label] of [
        [320, 1000, "320"],
        [1280, 1100, "desktop"],
      ] as const) {
        await mouse.setViewport(width, height);
        for (const level of [15, 31]) {
          await visit(mouse, game.black, `/games/${game.gameId}`, theme, level);
          await bodyHas(mouse, "Grasz krzyżykiem.");
          await mouse.waitFor("[role=grid]");
          expect(await mouse.evaluate<number>("document.querySelectorAll('[role=grid] [role=row]').length"), `${label} level`).toBe(level);
          expect(await marksOnSheet(mouse, "path")).toBe(5);
          expect(await marksOnSheet(mouse, "circle")).toBe(4);
          expect(await mouse.count("svg line[data-seat]")).toBe(1);
          expect(await mouse.count("[role=img][aria-label=krzyżyk]")).toBe(1);
          expect(await mouse.count("[role=img][aria-label=kółko]")).toBe(1);
          expect(await textOf(mouse)).not.toMatch(NO_COLOUR_OR_STONE);
          expect(await overflows(mouse), `${theme} ${label} ${level}: no sideways scrolling`).toBe(false);
          const centre = await centreButton(mouse);
          expect(centre, `${theme} ${label} ${level}: Wyśrodkuj stays in its frame`).toMatchObject({ spill: 0, hits: 0 });
          expect(centre.height).toBeGreaterThanOrEqual(44);
          await shot(mouse, `gra-piatka-${label}-${level}-${theme}`);
        }
      }
    }
    await mouse.evaluate(`localStorage.removeItem(${JSON.stringify(LEVEL_KEY)})`);

    // The player of ○ on a touch screen: two steps, the button and the status name the mark.
    await touch.setViewport(320, 1000);
    for (const theme of ["dark", "light"] as const) {
      await visit(touch, game.white, `/games/${game.gameId}`, theme);
      await bodyHas(touch, "Twój ruch (kółko)");
      await bodyHas(touch, "Grasz kółkiem.");
      await touch.evaluate(`document.querySelector('[aria-label="Pole 1, 3, puste"]').click()`);
      await bodyHas(touch, "Zaznaczono pole 1, 3. Naciśnij „Postaw kółko”.");
      expect(await touch.evaluate<number>("[...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Postaw kółko').length")).toBe(1);
      expect(await touch.count('[aria-label="Pole 1, 3, puste, zaznaczone"] svg circle')).toBe(1);
      expect(await textOf(touch)).not.toMatch(NO_COLOUR_OR_STONE);
      expect(await overflows(touch)).toBe(false);
      await shot(touch, `gra-podglad-320-${theme}`);
    }
    await touch.run("find", "text", "Postaw kółko", "click");
    await touch.waitForFn(`document.querySelector('[aria-label^="Pole 1, 3, kółko, ostatni ruch"]') !== null`);

    // Black runs out of time while leading: the automat plays for it with a broken line and says so.
    await turnBegan(game, 61);
    expect((await call("GET", `/api/games/${game.gameId}`, undefined, game.white)).status).toBe(200);
    await visit(mouse, game.white, `/games/${game.gameId}`, "dark");
    await mouse.waitForFn(`document.querySelector('[aria-label*="krzyżyk"][aria-label*="postawiony przez automat"]') !== null`);
    expect(await mouse.count('[aria-label*="postawiony przez automat"] svg[class*="stroke-dasharray"]')).toBe(1);
    await shot(mouse, "gra-automat-desktop-dark");
    await visit(mouse, game.black, `/games/${game.gameId}`, "light");
    await bodyHas(mouse, "automat stawia znaki za Ciebie");
    await shot(mouse, "gra-automat-desktop-light");

    // A spectator names the sides and the turn by mark.
    await mouse.setViewport(320, 1000);
    for (const theme of ["dark", "light"] as const) {
      await visit(mouse, null, `/invite/${game.code}`, theme);
      await mouse.waitFor("[data-testid=invite-watch-note]");
      await mouse.fill("#watch-nickname", "Zosia");
      await mouse.run("find", "text", "Oglądaj partię", "click");
      await bodyHas(mouse, "Oglądasz partię");
      await bodyHas(mouse, "Ruch kółka");
      expect(await mouse.evaluate<string>(MAIN_TEXT)).toMatch(/Krzyżyk: /);
      expect(await mouse.evaluate<string>(MAIN_TEXT)).toMatch(/Kółko: /);
      expect(await textOf(mouse)).not.toMatch(NO_COLOUR_OR_STONE);
      expect(await overflows(mouse)).toBe(false);
      await shot(mouse, `widz-320-${theme}`);
      await mouse.setViewport(1280, 1100);
      await shot(mouse, `widz-desktop-${theme}`);
      await mouse.setViewport(320, 1000);
    }

    // White's clock ends the game: the leader wins on points, by mark for the spectator.
    await turnBegan(game, 61);
    expect((await call("GET", `/api/games/${game.gameId}`, undefined, game.black)).status).toBe(200);
    await bodyHas(mouse, "Wygrał krzyżyk");
    expect(await textOf(mouse)).not.toMatch(NO_COLOUR_OR_STONE);
    await shot(mouse, "widz-wynik-320-light");

    // The result and the review, for the players.
    for (const theme of ["dark", "light"] as const) {
      for (const [width, height, label] of [
        [320, 1400, "320"],
        [1280, 1100, "desktop"],
      ] as const) {
        await mouse.setViewport(width, height);
        await visit(mouse, game.white, `/games/${game.gameId}`, theme);
        await bodyHas(mouse, "Grałeś kółkiem.");
        await bodyHas(mouse, "zamienionymi znakami: zagrasz krzyżykiem");
        expect(await textOf(mouse)).not.toMatch(NO_COLOUR_OR_STONE);
        expect(await overflows(mouse)).toBe(false);
        await shot(mouse, `wynik-${label}-${theme}`);
        await visit(mouse, game.black, `/games/${game.gameId}/review`, theme);
        await bodyHas(mouse, "Krzyżyk: Ty (");
        await bodyHas(mouse, "Kółko: ");
        expect(await mouse.count("[data-testid=review-players] svg path")).toBe(1);
        expect(await mouse.count("[data-testid=review-players] svg circle")).toBe(1);
        expect(await textOf(mouse)).not.toMatch(/czarn|biał/i);
        expect(await overflows(mouse)).toBe(false);
        await shot(mouse, `przeglad-${label}-${theme}`);
      }
    }
  }, 300_000);

  it("reviews a paper game ended by resignation as a paper game, not as an empty classic board", async () => {
    const game = await startedGame();
    await play(game, "black", 50, 50, 1);
    expect((await call("POST", `/api/games/${game.gameId}/resign`, {}, game.white)).status).toBe(200);
    await mouse.setViewport(1280, 1100);
    await visit(mouse, game.black, `/games/${game.gameId}/review`, "light");
    await bodyHas(mouse, "Krzyżyk: Ty (");
    await bodyHas(mouse, "Kółko: ");
    expect(await mouse.count("[data-testid=review-paper-note]")).toBe(1);
    expect(await textOf(mouse)).not.toMatch(/czarn|biał/i);
  }, 120_000);
});
