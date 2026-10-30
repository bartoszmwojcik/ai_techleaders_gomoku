// Resigning in two real browsers (E02 phase 5, E02-S05, #87 step 5): the confirm dialog (focus on
// "Wróć do gry", Esc), resigning out of turn, the result with its reason on both pages without a
// reload, a network error with a retry, a game that ended in the meantime, a guest who resigns and
// a new game right after. Screenshots go to $GOMOKU_SHOTS_DIR in the theme $GOMOKU_SHOTS_THEME
// (default light) when the directory is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const first = new Browser(`${inject("browserSession")}-resign-a`);
const second = new Browser(`${inject("browserSession")}-resign-b`);
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const shotsTheme = process.env.GOMOKU_SHOTS_THEME === "dark" ? "dark" : "light";

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  for (const browser of [first, second]) await browser.clearCookies();
});
afterAll(async () => {
  await orm.close();
  for (const browser of [first, second]) {
    await browser.setHeaders({});
    await browser.clearCookies();
    await browser.close();
  }
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.54.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

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

async function giveCookie(browser: Browser, pair: string) {
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
}

async function signedUp(browser: Browser) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `resignpage-${n}@example.com`,
    displayName: `Rsg_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await giveCookie(browser, pair);
  return pair;
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const shot = async (browser: Browser, name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}-${shotsTheme}.png`);
};
const horizontalOverflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const confirm = (browser: Browser) => browser.click("[role=alertdialog] button:last-child");
const focused = (browser: Browser) => browser.evaluate<string>("document.activeElement?.textContent ?? ''");
const statusOf = async (gameId: string) => (await run(`select status, end_reason from games where id = ?`, [gameId]))[0]!;

type Pair = { gameId: string; black: Browser; white: Browser; creatorCookie: string; joinerCookie: string };

/** A game both players have open. `first` is the creator; the joiner (`second`) is an account or a guest. */
async function openGame(joiner: "user" | "guest" = "user"): Promise<Pair> {
  const creatorCookie = await signedUp(first);
  const created = (await (await api("POST", "/api/games", {}, creatorCookie)).json()) as {
    data: { gameId: string; invitation: { code: string } };
  };
  let joinerCookie: string;
  if (joiner === "guest") {
    const joined = await api("POST", `/api/invitations/${created.data.invitation.code}/accept`, { as: "guest", acknowledgedGuestWarning: true });
    expect(joined.status).toBe(200);
    joinerCookie = (joined.headers.getSetCookie?.() ?? []).find((line) => line.startsWith("gomoku_guest="))!.split(";")[0]!;
    await giveCookie(second, joinerCookie);
  } else {
    joinerCookie = await signedUp(second);
    expect((await api("POST", `/api/invitations/${created.data.invitation.code}/accept`, { as: "user" }, joinerCookie)).status).toBe(200);
  }
  const gameId = created.data.gameId;
  for (const browser of [first, second]) {
    await browser.setViewport(360, 800);
    await browser.open(`${baseUrl}/games/${gameId}`);
  }
  for (const browser of [first, second]) await bodyHas(browser, "Partia w toku");
  const [row] = await run(`select black_seat from games where id = ?`, [gameId]);
  const blackIsCreator = row!.black_seat === 1;
  return { gameId, black: blackIsCreator ? first : second, white: blackIsCreator ? second : first, creatorCookie, joinerCookie };
}

describe("resigning on the board", () => {
  it("asks first (focus on the way out, Esc), resigns out of turn, shows the result with its reason to both and frees the player", async () => {
    const { gameId, black, white } = await openGame();
    await white.waitFor("[data-testid=resign]");
    await shot(white, "p05-13-przycisk-360");

    // Before the first move and out of turn: the button is there, the dialog starts on "Wróć do gry".
    await white.click("[data-testid=resign]");
    await white.waitFor("[role=alertdialog]");
    expect(await white.text("[role=alertdialog]")).toContain("Czy na pewno chcesz się poddać?");
    expect(await white.text("[role=alertdialog]")).toContain("Przeciwnik wygra partię.");
    expect(await focused(white)).toBe("Wróć do gry");
    await shot(white, "p05-13-dialog-360");
    expect(await horizontalOverflow(white)).toBe(false);

    // Esc and "Wróć do gry" close it and send nothing.
    await white.press("Escape");
    await white.waitForFn("document.querySelectorAll('[role=alertdialog]').length === 0");
    await white.click("[data-testid=resign]");
    await white.waitFor("[role=alertdialog]");
    await white.run("find", "text", "Wróć do gry", "click");
    await white.waitForFn("document.querySelectorAll('[role=alertdialog]').length === 0");
    expect(await statusOf(gameId)).toMatchObject({ status: "active" });

    // Confirmed: the resigner sees p06.8, the opponent finds it by polling, without a reload.
    await white.click("[data-testid=resign]");
    await white.waitFor("[role=alertdialog]");
    await confirm(white);
    await bodyHas(white, "Przegrałeś, poddałeś partię");
    await bodyHas(black, "Wygrałeś, przeciwnik poddał partię");
    expect(await statusOf(gameId)).toMatchObject({ status: "finished", end_reason: "resignation" });
    for (const browser of [white, black]) {
      await bodyHas(browser, "Koniec partii");
      expect(await browser.count("[data-testid=resign]")).toBe(0);
      expect(await browser.evaluate<string>("document.querySelector('[role=grid]').getAttribute('aria-readonly')")).toBe("true");
      expect(await horizontalOverflow(browser)).toBe(false);
    }
    await shot(white, "p06-8-poddales-sie-360");
    await shot(black, "p06-9-przeciwnik-sie-poddal-360");

    // A new game is possible right away (BR-13).
    await white.open(`${baseUrl}/`);
    await white.waitFor("[data-testid=create-game]");
    await white.click("[data-testid=create-game]");
    await bodyHas(white, "Czekamy na przeciwnika…");
  });

  it("keeps the dialog on a network error and sends again with \"Spróbuj ponownie\" (p05.14)", async () => {
    const { gameId, black } = await openGame();
    await black.evaluate(`(() => {
      const real = window.fetch.bind(window);
      let failed = false;
      window.fetch = (url, init) => {
        if (String(url).endsWith('/resign') && !failed) { failed = true; return Promise.reject(new TypeError('offline')); }
        return real(url, init);
      };
      return true;
    })()`);
    await black.click("[data-testid=resign]");
    await black.waitFor("[role=alertdialog]");
    await confirm(black);
    await black.waitFor("[role=alertdialog] [role=alert]");
    expect(await black.text("[role=alertdialog] [role=alert]")).toBe("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    expect(await black.text("[role=alertdialog] button:last-child")).toBe("Spróbuj ponownie");
    expect(await statusOf(gameId)).toMatchObject({ status: "active" });
    await shot(black, "p05-14-blad-360");
    expect(await horizontalOverflow(black)).toBe(false);

    await confirm(black);
    await bodyHas(black, "Przegrałeś, poddałeś partię");
    expect(await statusOf(gameId)).toMatchObject({ status: "finished", end_reason: "resignation" });
  });

  it("shows the result when the game ended in the meantime (409 GAME_FINISHED)", async () => {
    const { gameId, black, white, creatorCookie, joinerCookie } = await openGame();
    // The page of `black` cannot read the state: it still shows a game in progress.
    await black.evaluate(`(() => {
      const real = window.fetch.bind(window);
      window.__blockReads = true;
      window.fetch = (url, init) => (window.__blockReads && init?.method === 'GET'
        ? Promise.reject(new TypeError('offline')) : real(url, init));
      return true;
    })()`);
    // White resigns through the API, so black has won; black does not know yet and resigns too.
    const whiteCookie = white === first ? creatorCookie : joinerCookie;
    expect((await api("POST", `/api/games/${gameId}/resign`, undefined, whiteCookie)).status).toBe(200);
    await black.click("[data-testid=resign]");
    await black.waitFor("[role=alertdialog]");
    await confirm(black);
    await black.evaluate("(() => { window.__blockReads = false; return true; })()");
    await black.waitForFn("document.querySelectorAll('[role=alertdialog]').length === 0");
    await bodyHas(black, "Wygrałeś, przeciwnik poddał partię");
    expect(await statusOf(gameId)).toMatchObject({ status: "finished", end_reason: "resignation" });
  });

  it("lets a guest resign, and shows the account the result", async () => {
    const { gameId, black, white } = await openGame("guest");
    const guestBrowser = second;
    const other = guestBrowser === black ? white : black;
    expect(await guestBrowser.text("main")).toContain("Grasz bez konta");
    await guestBrowser.click("[data-testid=resign]");
    await guestBrowser.waitFor("[role=alertdialog]");
    await confirm(guestBrowser);
    await bodyHas(guestBrowser, "Przegrałeś, poddałeś partię");
    await bodyHas(other, "Wygrałeś, przeciwnik poddał partię");
    expect(await statusOf(gameId)).toMatchObject({ status: "finished", end_reason: "resignation" });
    expect(await guestBrowser.count("[data-testid=resign]")).toBe(0);
  });
});
