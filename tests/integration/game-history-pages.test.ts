// The history page in a real browser (E04-S01, #27): a visitor is sent to the login and back; the
// home page links to it for an account only; the list shows the opponent, result, date (Warsaw
// time) and how it ended; a guest with a 24-character nickname keeps "(gość)" visible at 320 px
// without sideways scrolling; "Pokaż starsze" appends the next page. Screenshots go to
// $GOMOKU_SHOTS_DIR in the theme $GOMOKU_SHOTS_THEME (default light) when the directory is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(`${inject("browserSession")}-history`);
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
const nextAddress = () => `198.62.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

async function signedUp() {
  const n = `${Date.now().toString(36)}${++counter}`;
  const name = `Hp_${n}`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
    body: JSON.stringify({ email: `historypage-${n}@example.com`, displayName: name, password: "secret123" }),
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
  const [row] = await run(`select id from users where display_name = ?`, [name]);
  users.push(row!.id as string);
  return { name, id: row!.id as string };
}

/** A finished game of `me` against a guest or an account, written straight into the tables. */
async function seed(me: string, opponent: { guest: string | null } | { account: string | null }, finishedAt: string, over: { winner?: 1 | 2 | null; reason?: string } = {}) {
  const reason = over.reason ?? "five_in_row";
  const [game] = await run(
    `insert into games (origin, status, started_at, finished_at, black_seat, winner_seat, end_reason)
     values ('invite', 'finished', ?::timestamptz - interval '5 minutes', ?::timestamptz, 1, ?, ?) returning id`,
    [finishedAt, finishedAt, over.winner === undefined ? 1 : over.winner, reason],
  );
  await run(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 1, 'account', ?, false)`, [game!.id, me]);
  if ("guest" in opponent) {
    await run(`insert into game_players (game_id, seat, kind, nickname, is_active) values (?, 2, 'guest', ?, false)`, [game!.id, opponent.guest]);
  } else {
    await run(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 2, 'account', ?, false)`, [game!.id, opponent.account]);
  }
}

const bodyHas = (text: string) => browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const shot = async (name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}-${shotsTheme}.png`);
};
const overflows = () => browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const ROWS = "ul[aria-label='Zakończone partie'] li";

describe("the history page", () => {
  it("sends a visitor without an account to the login", async () => {
    await browser.clearCookies();
    await browser.open(`${baseUrl}/history`);
    await browser.waitFor("[data-testid=login-form]");
    expect(await browser.url()).toContain("/login?next=%2Fhistory");
  });

  it("is linked from the home page for a signed-in player only", async () => {
    await signedUp();
    await browser.open(`${baseUrl}/`);
    await browser.waitFor("a[href='/history']");
    await browser.clearCookies();
    await browser.open(`${baseUrl}/`);
    await browser.waitFor("a[href='/register']");
    expect(await browser.count("a[href='/history']")).toBe(0);
  });

  it("says that nothing was played yet and offers an invitation", async () => {
    await signedUp();
    await browser.setViewport(320, 800);
    await browser.open(`${baseUrl}/history`);
    await bodyHas("Nie rozegrałeś jeszcze żadnej partii");
    expect(await browser.count(ROWS)).toBe(0);
    await shot("historia-pusta-320");
    expect(await overflows()).toBe(false);
  });

  it("lists the games with the opponent, the result, the date in Warsaw time and how it ended", async () => {
    const alice = await signedUp();
    const bob = await signedUp();
    await browser.clearCookies();
    const opponent = { account: bob.id };
    // 2026-10-30 09:00 UTC is 10:00 CET; the summer date shows CEST.
    await seed(alice.id, opponent, "2026-10-30T09:00:00.000Z");
    await seed(alice.id, opponent, "2026-07-15T09:00:00.000Z", { winner: 2, reason: "timeout" });
    await seed(alice.id, { guest: "Kasia" }, "2026-06-01T09:00:00.000Z", { winner: null, reason: "draw" });
    await seed(alice.id, { account: null }, "2026-05-01T09:00:00.000Z", { reason: "resignation" });
    await seed(alice.id, { guest: "Bardzo_Dlugi_Nick_Goscia" }, "2026-04-01T09:00:00.000Z");
    // Sign in as alice again (the cookie was cleared to hand the other account the seed).
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
      body: JSON.stringify({ email: (await run(`select email from users where id = ?`, [alice.id]))[0]!.email, password: "secret123" }),
    });
    expect(response.status).toBe(200);
    const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
    await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
    await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
    await browser.setViewport(320, 800);

    await browser.open(`${baseUrl}/history`);
    await bodyHas("Historia partii");
    await browser.waitFor(ROWS);

    expect(await browser.count(ROWS)).toBe(5);
    // textContent, not innerText: the nickname and "(gość)" are separate boxes, which innerText breaks into lines.
    const text = await browser.evaluate<string>(`document.querySelector("ul[aria-label='Zakończone partie']").textContent`);
    expect(text).toContain(`${bob.name}`);
    expect(text).toContain("30 października 2026, 10:00 CET");
    expect(text).toContain("15 lipca 2026, 11:00 CEST");
    expect(text).toContain("Porażka");
    expect(text).toContain("Koniec czasu");
    expect(text).toContain("Kasia (gość)");
    expect(text).toContain("Remis");
    expect(text).toContain("Plansza pełna");
    expect(text).toContain("Usunięty gracz");
    expect(text).toContain("Poddanie");
    expect(text).toContain("(gość)");
    expect(text).not.toContain("@");
    expect(await browser.count("[data-testid=history-more]")).toBe(0);
    await shot("historia-lista-320");
    expect(await overflows()).toBe(false);
    // A long guest nickname is cut, never the "(gość)" next to it; the whole name is in the title.
    const longName = await browser.evaluate<{ title: string; suffixInView: boolean }>(
      `(() => { const el = [...document.querySelectorAll('[data-testid=player-name]')].find(e => e.title.startsWith('Bardzo')); return { title: el.title, suffixInView: el.lastElementChild.getBoundingClientRect().right <= document.documentElement.clientWidth }; })()`,
    );
    expect(longName).toEqual({ title: "Bardzo_Dlugi_Nick_Goscia (gość)", suffixInView: true });
    for (const width of [360, 1280]) {
      await browser.setViewport(width, 800);
      expect(await overflows()).toBe(false);
      await shot(`historia-lista-${width}`);
    }
  });

  it("appends older games with \"Pokaż starsze\" and hides the button after the last page", async () => {
    const alice = await signedUp();
    const base = Date.parse("2026-03-01T09:00:00.000Z");
    for (let i = 0; i < 25; i++) {
      await seed(alice.id, { guest: `Gość${i}` }, new Date(base + i * 3_600_000).toISOString());
    }
    await browser.setViewport(320, 800);

    await browser.open(`${baseUrl}/history`);
    await browser.waitFor("[data-testid=history-more]");
    expect(await browser.count(ROWS)).toBe(20);
    await shot("historia-dwadziescia-320");

    await browser.click("[data-testid=history-more]");
    await browser.waitForFn(`document.querySelectorAll(${JSON.stringify(ROWS)}).length === 25`);
    await bodyHas("Dodano 5 starszych partii.");
    expect(await browser.count("[data-testid=history-more]")).toBe(0);
    // Newest first: the last row is the oldest game.
    expect(await browser.evaluate<string>(`document.querySelector(${JSON.stringify(`${ROWS}:last-child`)}).textContent`)).toContain("Gość0 (gość)");
    expect(await overflows()).toBe(false);
  });
});
