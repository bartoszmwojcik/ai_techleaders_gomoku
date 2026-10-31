// The lobby in two real browsers (E03-S01, #25): a visitor is sent to the login; user A marks
// themselves and user B sees A on the list without a reload; A withdraws and disappears; a
// status that ran out brings the button back with a notice; B picks A and both land in the same
// game (A by polling); a stale pick says "zagrał już z kimś innym" / "status wygasł"; a user with a game sees "Masz już
// partię"; the home page links to the lobby. Screenshots go to $GOMOKU_SHOTS_DIR in the theme
// $GOMOKU_SHOTS_THEME (default light) when the directory is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const first = new Browser(`${inject("browserSession")}-lobby-a`);
const second = new Browser(`${inject("browserSession")}-lobby-b`);
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const shotsTheme = process.env.GOMOKU_SHOTS_THEME === "dark" ? "dark" : "light";

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  await orm.em.fork().execute(`delete from lobby_seekers`, [], "run");
  for (const browser of [first, second]) await browser.clearCookies();
});
afterAll(async () => {
  await orm.em.fork().execute(`delete from lobby_seekers`, [], "run");
  await orm.close();
  for (const browser of [first, second]) {
    await browser.clearCookies();
    await browser.close();
  }
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.57.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

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
  const name = `Lp_${n}`;
  const response = await api("POST", "/api/auth/register", {
    email: `lobbypage-${n}@example.com`,
    displayName: name,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
  const [row] = await run(`select id from users where display_name = ?`, [name]);
  return { name, cookie: pair, id: row!.id as string };
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const bodyLacks = (browser: Browser, text: string) =>
  browser.waitForFn(`!document.body.innerText.includes(${JSON.stringify(text)})`);
const shot = async (browser: Browser, name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}-${shotsTheme}.png`);
};
const horizontalOverflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const rowCount = (browser: Browser) => browser.count("ul[aria-label='Gracze szukający gry'] li");

describe("the lobby page", () => {
  it("sends a visitor without an account to the login and back to the lobby after signing in", async () => {
    await first.clearCookies();
    await first.open(`${baseUrl}/lobby`);
    await first.waitFor("[data-testid=login-form]");
    expect(await first.url()).toContain("/login?next=%2Flobby");
  });

  it("links to the lobby from the home page for a signed-in player only", async () => {
    await signedUp(first);
    await first.open(`${baseUrl}/`);
    await first.waitFor("a[href='/lobby']");
    await first.clearCookies();
    await first.open(`${baseUrl}/`);
    await first.waitFor("a[href='/register']");
    expect(await first.count("a[href='/lobby']")).toBe(0);
  });

  it("marks A, shows A to B without a reload, and drops A from the list after the withdrawal", async () => {
    const [alice, bob] = [await signedUp(first), await signedUp(second)];
    for (const browser of [first, second]) await browser.setViewport(320, 800);
    await second.open(`${baseUrl}/lobby`);
    await second.waitFor("[data-testid=lobby-mark]");
    await bodyHas(second, "Nikt teraz nie szuka gry");
    await shot(second, "lobby-pusto-320");

    await first.open(`${baseUrl}/lobby`);
    await first.waitFor("[data-testid=lobby-mark] button");
    await first.click("[data-testid=lobby-mark] button");
    await first.waitFor("[data-testid=lobby-seeking]");
    await bodyHas(first, "Szukasz gry");
    await bodyHas(first, "Status wygasa za 4:5");
    await shot(first, "lobby-szukam-320");
    expect(await first.count("[data-testid=lobby-mark]")).toBe(0);

    // B finds A by polling, no reload; the row has a pick button (#26).
    await bodyHas(second, alice.name);
    expect(await rowCount(second)).toBe(1);
    expect(await second.count("ul[aria-label='Gracze szukający gry'] button")).toBe(1);
    await shot(second, "lobby-lista-320");
    expect(await horizontalOverflow(second)).toBe(false);
    expect(await horizontalOverflow(first)).toBe(false);
    // A does not see A in the list of others.
    expect(await first.text("main")).not.toContain(`${alice.name}\n`);
    expect(await rowCount(first)).toBe(0);

    await first.click("[data-testid=lobby-seeking] button");
    await first.waitFor("[data-testid=lobby-mark] button");
    await bodyLacks(second, alice.name);
    expect(await rowCount(second)).toBe(0);
    expect(await run(`select 1 from lobby_seekers where user_id = ?`, [alice.id])).toHaveLength(0);
    expect(bob.id).not.toBe(alice.id);
  });

  it("brings the button back with a notice when the own status runs out, and A leaves B's list", async () => {
    const [alice] = [await signedUp(first), await signedUp(second)];
    await second.open(`${baseUrl}/lobby`);
    await first.open(`${baseUrl}/lobby`);
    await first.click("[data-testid=lobby-mark] button");
    await first.waitFor("[data-testid=lobby-seeking]");
    await bodyHas(second, alice.name);

    // The status ends in 3 s: the page counts down (or its next read finds none) and says so.
    await run(`update lobby_seekers set created_at = now() - interval '298 seconds', expires_at = now() + interval '3 seconds' where user_id = ?`, [alice.id]);
    await bodyHas(first, "Status wygasł");
    await first.waitFor("[data-testid=lobby-mark] button");
    expect(await first.count("[data-testid=lobby-seeking]")).toBe(0);
    await shot(first, "lobby-wygasl-320");
    await bodyLacks(second, alice.name);
  });

  it("tells a user who already has a game that they have one, with the way back (BR-13)", async () => {
    const alice = await signedUp(first);
    const created = (await (await api("POST", "/api/games", {}, alice.cookie)).json()) as { data: { gameId: string } };

    await first.open(`${baseUrl}/lobby`);
    await bodyHas(first, "Masz już partię");
    expect(await first.count("[data-testid=lobby-mark]")).toBe(0);
    expect(await first.count("a[href='/games/" + created.data.gameId + "']")).toBeGreaterThan(0);
    await shot(first, "lobby-masz-partie-320");
    expect(await horizontalOverflow(first)).toBe(false);
  });

  it("shows the marked status again after a reload (it lives on the server)", async () => {
    const alice = await signedUp(first);
    await first.open(`${baseUrl}/lobby`);
    await first.click("[data-testid=lobby-mark] button");
    await first.waitFor("[data-testid=lobby-seeking]");

    await first.open(`${baseUrl}/lobby`);

    await first.waitFor("[data-testid=lobby-seeking]");
    await bodyHas(first, "Szukasz gry");
    await first.click("[data-testid=lobby-seeking] button");
    await first.waitFor("[data-testid=lobby-mark] button");
    expect(await run(`select 1 from lobby_seekers where user_id = ?`, [alice.id])).toHaveLength(0);
  });

  it("lets B pick A: B goes to the game at once, A is taken there by the next read, and the lobby holds neither", async () => {
    const [alice, bob] = [await signedUp(first), await signedUp(second)];
    for (const browser of [first, second]) await browser.setViewport(1280, 800);
    await first.open(`${baseUrl}/lobby`);
    await first.click("[data-testid=lobby-mark] button");
    await first.waitFor("[data-testid=lobby-seeking]");
    await second.open(`${baseUrl}/lobby`);
    await bodyHas(second, alice.name);
    await shot(second, "lobby-wybor-1280");

    await second.click(`button[aria-label='Zagraj z ${alice.name}']`);

    await second.waitForFn("location.pathname.startsWith('/games/')");
    const secondPath = new URL(await second.url()).pathname;
    // A never clicked anything: the polling sends A to the same game.
    await first.waitForFn("location.pathname.startsWith('/games/')");
    expect(new URL(await first.url()).pathname).toBe(secondPath);
    const [game] = await run(`select origin, status from games where id = ?`, [secondPath.split("/")[2]]);
    expect(game).toEqual({ origin: "lobby", status: "active" });
    expect(await run(`select 1 from lobby_seekers where user_id in (?, ?)`, [alice.id, bob.id])).toHaveLength(0);
    await second.waitFor("[role=grid]");
  });

  it("tells B that A was taken by somebody else, when B's list was stale, and keeps B on the lobby", async () => {
    const [alice, bob] = [await signedUp(first), await signedUp(second)];
    const carol = await (async () => {
      const n = `${Date.now().toString(36)}${++counter}`;
      const response = await api("POST", "/api/auth/register", {
        email: `lobbypage-${n}@example.com`,
        displayName: `Lp_${n}`,
        password: "secret123",
      });
      return { cookie: (response.headers.get("set-cookie") ?? "").split(";")[0]! };
    })();
    for (const browser of [first, second]) await browser.setViewport(320, 800);
    await first.open(`${baseUrl}/lobby`);
    await first.click("[data-testid=lobby-mark] button");
    await first.waitFor("[data-testid=lobby-seeking]");
    await second.open(`${baseUrl}/lobby`);
    await bodyHas(second, alice.name);
    // B's page stops polling (hidden tab), so its list stays as it is while C takes A.
    await second.evaluate(
      "(Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }), document.dispatchEvent(new Event('visibilitychange')), true)",
    );
    const [seeker] = await run(`select id from lobby_seekers where user_id = ?`, [alice.id]);
    expect((await api("POST", `/api/lobby/seekers/${seeker!.id}/pick`, undefined, carol.cookie)).status).toBe(200);

    await second.click(`button[aria-label='Zagraj z ${alice.name}']`);

    await bodyHas(second, "Ten gracz zagrał już z kimś innym. Wybierz kogoś innego z listy.");
    expect(new URL(await second.url()).pathname).toBe("/lobby");
    await shot(second, "lobby-zajety-320");
    expect(await horizontalOverflow(second)).toBe(false);
    expect(bob.id).not.toBe(alice.id);
  });

  it("tells B that A's status ran out, when B's list was stale", async () => {
    const [alice] = [await signedUp(first), await signedUp(second)];
    for (const browser of [first, second]) await browser.setViewport(360, 800);
    await first.open(`${baseUrl}/lobby`);
    await first.click("[data-testid=lobby-mark] button");
    await first.waitFor("[data-testid=lobby-seeking]");
    await second.open(`${baseUrl}/lobby`);
    await bodyHas(second, alice.name);
    await second.evaluate(
      "(Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }), document.dispatchEvent(new Event('visibilitychange')), true)",
    );
    await run(`update lobby_seekers set created_at = now() - interval '301 seconds', expires_at = now() - interval '1 second' where user_id = ?`, [alice.id]);

    await second.click(`button[aria-label='Zagraj z ${alice.name}']`);

    await bodyHas(second, "Status tego gracza wygasł.");
    expect(new URL(await second.url()).pathname).toBe("/lobby");
    await shot(second, "lobby-wygasl-wybor-360");
    expect(await run(`select 1 from games where origin = 'lobby' and id in (select game_id from game_players where user_id = ?)`, [alice.id])).toHaveLength(0);
  });
});
