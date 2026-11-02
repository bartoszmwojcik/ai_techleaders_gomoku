// The review of a finished game in a real browser (E09-S01, #203): a visitor without an account is
// sent to the login; an account opens its own game from /history and steps through the moves
// (start / previous / next / end), sees the result and how it ended, and finds no chat; somebody
// else's game, a missing one and one removed by the cleanup answer 404 with one text; nothing
// overflows at 320 px. Screenshots go to $GOMOKU_SHOTS_DIR when the directory is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(`${inject("browserSession")}-review`);
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const shotsTheme = process.env.GOMOKU_SHOTS_THEME === "dark" ? "dark" : "light";

let orm: Orm;
const users: string[] = [];
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  await browser.clearCookies();
});
afterAll(async () => {
  if (users.length > 0) {
    await run(`delete from games where id in (select game_id from game_players where user_id = any(?::uuid[]))`, [`{${users.join(",")}}`]);
  }
  await orm.close();
  await browser.clearCookies();
  await browser.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.63.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

/** Registers an account and puts its session in the browser; `cookie` is the same session for `fetch`. */
async function signedUp() {
  const n = `${Date.now().toString(36)}${++counter}`;
  const name = `Rv_${n}`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
    body: JSON.stringify({ email: `reviewpage-${n}@example.com`, displayName: name, password: "secret123" }),
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
  const [row] = await run(`select id from users where display_name = ?`, [name]);
  users.push(row!.id as string);
  return { name, id: row!.id as string, cookie: pair };
}

const bits = (cells: number[]) => Array.from({ length: 225 }, (_, c) => (cells.includes(c) ? "1" : "0")).join("");
// Black (seat 1) wins with five in row 7 (cells 105..109); white's four stones are on row 8.
const BLACK = [105, 106, 107, 108, 109];
const WHITE = [120, 121, 122, 123];
const MOVES = [105, 120, 106, 121, 107, 122, 108, 123, 109];

/** A finished game of `me` (black, seat 1) against the guest "Kasia", with its whole move log. */
async function seed(me: string): Promise<string> {
  const [game] = await run(
    `insert into games (origin, status, started_at, finished_at, black_seat, winner_seat, end_reason, move_count, stones_black, stones_white, moves)
     values ('invite', 'finished', now() - interval '5 minutes', now(), 1, 1, 'five_in_row', ?, ?::bit(225), ?::bit(225), decode(?, 'hex')) returning id`,
    [MOVES.length, bits(BLACK), bits(WHITE), Buffer.from(MOVES).toString("hex")],
  );
  await run(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 1, 'account', ?, false)`, [game!.id, me]);
  await run(`insert into game_players (game_id, seat, kind, nickname, is_active) values (?, 2, 'guest', 'Kasia', false)`, [game!.id]);
  return game!.id as string;
}

const get = (path: string, cookie?: string) => fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
const bodyHas = (text: string) => browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const step = () => browser.text("[data-testid=review-step]");
const stones = () => browser.count("[role=gridcell] button[aria-label*='kamień']");
const shot = async (name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}-${shotsTheme}.png`);
};
const overflows = () => browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");

describe("the review page", () => {
  it("sends a visitor without an account to the login and back", async () => {
    await browser.clearCookies();
    const id = "0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978";
    await browser.open(`${baseUrl}/games/${id}/review`);
    await browser.waitFor("[data-testid=login-form]");
    expect(await browser.url()).toContain(`/login?next=${encodeURIComponent(`/games/${id}/review`)}`);
  });

  it("opens a game from the history and steps through its moves", async () => {
    const me = await signedUp();
    const id = await seed(me.id);
    await browser.setViewport(320, 800);

    await browser.open(`${baseUrl}/history`);
    await browser.waitFor("[data-testid=history-review]");
    await browser.click("[data-testid=history-review]");
    await browser.waitFor("[data-testid=review-step]");
    expect(await browser.url()).toContain(`/games/${id}/review`);

    // Opens on the final position, with the result and how it ended.
    await bodyHas("Wygrałeś");
    const body = await browser.evaluate<string>("document.body.innerText");
    expect(body).toContain("5 w linii");
    // textContent, not innerText: the nickname and "(gość)" are separate boxes.
    expect(await browser.evaluate<string>(`document.querySelector("[data-testid=review-players]").textContent`)).toContain("Kasia (gość)");
    expect(await step()).toBe("Ruch 9 z 9: czarny, kolumna E, rząd 8");
    expect(await stones()).toBe(9);
    // No chat and no way to play (BR-34).
    expect(await browser.count("textarea, input[type=text], [data-testid*=chat]")).toBe(0);
    await shot("przeglad-320");
    expect(await overflows()).toBe(false);

    await browser.click("[data-testid=review-prev]");
    await browser.waitForFn(`document.querySelector("[data-testid=review-step]").textContent.startsWith("Ruch 8 z 9")`);
    expect(await stones()).toBe(8);
    await browser.click("[data-testid=review-start]");
    await browser.waitForFn(`document.querySelector("[data-testid=review-step]").textContent.startsWith("Początek")`);
    expect(await stones()).toBe(0);
    await browser.click("[data-testid=review-next]");
    await browser.waitForFn(`document.querySelector("[data-testid=review-step]").textContent.startsWith("Ruch 1 z 9")`);
    expect(await stones()).toBe(1);
    await browser.click("[data-testid=review-end]");
    await browser.waitForFn(`document.querySelector("[data-testid=review-step]").textContent.startsWith("Ruch 9 z 9")`);
    expect(await stones()).toBe(9);
  });

  it("answers 404 with one text for somebody else's game, a missing one and a removed one", async () => {
    const owner = await signedUp();
    const id = await seed(owner.id);
    const stranger = await signedUp();
    const missing = "0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978";

    const foreign = await get(`/games/${id}/review`, stranger.cookie);
    const absent = await get(`/games/${missing}/review`, stranger.cookie);
    const malformed = await get(`/games/not-a-uuid/review`, stranger.cookie);
    expect([foreign.status, absent.status, malformed.status]).toEqual([404, 404, 404]);
    const [foreignText, absentText] = [await foreign.text(), await absent.text()];
    expect(foreignText).toContain("Partia nie istnieje, została usunięta po okresie przechowywania albo nie masz do niej dostępu.");
    expect(absentText).toContain("Partia nie istnieje, została usunięta po okresie przechowywania albo nie masz do niej dostępu.");
    // The owner still reads it; the stranger got nothing of it (no names, no moves).
    expect((await get(`/games/${id}/review`, owner.cookie)).status).toBe(200);
    expect(foreignText).not.toContain("Kasia");

    // Removed by `db:cleanup` after the retention period: the same readable message.
    await run(`delete from games where id = ?`, [id]);
    await browser.open(`${baseUrl}/games/${id}/review`);
    await bodyHas("została usunięta po okresie przechowywania");
    expect(await browser.count("a[href='/history']")).toBeGreaterThan(0);
    await shot("przeglad-usunieta-320");
  });

  it("does not open a game that is still being played", async () => {
    const me = await signedUp();
    const [game] = await run(
      `insert into games (origin, status, started_at, black_seat) values ('invite', 'active', now(), 1) returning id`,
    );
    await run(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 1, 'account', ?, true)`, [game!.id, me.id]);

    expect((await get(`/games/${game!.id}/review`, me.cookie)).status).toBe(404);
  });
});
