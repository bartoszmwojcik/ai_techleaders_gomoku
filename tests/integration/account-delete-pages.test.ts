// Account deletion in real browsers (E01-S06, #37, step 7): the full flow (panel, dialog with focus
// on "Zostaw konto", success with the notice on `/`), a wrong password, the limit, the block with a
// link to the game and the way out through resigning, a game that started meanwhile (409), a waiting
// game, a network error with a retry, and the opponent who sees "Usunięty gracz". Both themes and
// 360 px. Screenshots go to $GOMOKU_SHOTS_DIR in the theme $GOMOKU_SHOTS_THEME (default light) when
// the directory is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const first = new Browser(`${inject("browserSession")}-del-a`);
const second = new Browser(`${inject("browserSession")}-del-b`);
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const shotsTheme = process.env.GOMOKU_SHOTS_THEME === "dark" ? "dark" : "light";
const PASSWORD = "secret123";
// Many browser steps per test; each takes a moment on a busy machine.
vi.setConfig({ testTimeout: 180_000 });

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
const nextAddress = () => `198.55.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

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

async function giveCookie(browser: Browser, pair: string, theme = shotsTheme) {
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", theme, baseUrl);
}

async function signedUp(browser: Browser) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const input = { email: `delpage-${n}@example.com`, displayName: `Dp_${n}`, password: PASSWORD };
  const response = await api("POST", "/api/auth/register", input);
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: { user: { id: string } } };
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await giveCookie(browser, pair);
  return { ...input, id: body.data.user.id, cookie: pair };
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const shot = async (browser: Browser, name: string) => {
  // The panel is far below the top of the page: bring it into the viewport (the dialog covers it anyway).
  await browser.evaluate(
    "(() => { document.querySelector('[data-testid=delete-account-panel]')?.scrollIntoView({ block: 'start' }); return true; })()",
  );
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}-${shotsTheme}.png`);
};
const horizontalOverflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const focusedId = (browser: Browser) =>
  browser.evaluate<string>("document.activeElement?.id || document.activeElement?.dataset?.testid || document.activeElement?.textContent || ''");
const dialogOpen = (browser: Browser) => browser.evaluate<boolean>("document.querySelectorAll('[role=alertdialog]').length > 0");
const dialogClosed = (browser: Browser) => browser.waitForFn("document.querySelectorAll('[role=alertdialog]').length === 0");
const exists = async (id: string) => (await run(`select 1 from users where id = ?`, [id])).length === 1;

const SUBMIT = "[data-testid=delete-account-submit]";
const CONFIRM = "[data-testid=delete-account-confirm]";
const confirmInDialog = (browser: Browser) => browser.click("[role=alertdialog] button:last-child");

// $GOMOKU_SHOTS_WIDTH widens the account page for screenshots at desktop size (default 360 px).
async function openAccount(browser: Browser, width = Number(process.env.GOMOKU_SHOTS_WIDTH ?? 360)) {
  await browser.setViewport(width, 900);
  await browser.open(`${baseUrl}/account`);
  await browser.waitFor("[data-testid=delete-account-panel]");
}

/** Types the password, ticks the box and clicks the button, so the dialog opens. */
async function prepare(browser: Browser, password = PASSWORD) {
  await browser.fill("#delete-account-password", password);
  await browser.click(CONFIRM);
  await browser.click(SUBMIT);
  await browser.waitFor("[role=alertdialog]");
}

/** `first` creates a game; `second` joins as an account. Returns both and the game id. */
async function playingGame() {
  const creator = await signedUp(first);
  const created = (await (await api("POST", "/api/games", {}, creator.cookie)).json()) as {
    data: { gameId: string; invitation: { code: string } };
  };
  const joiner = await signedUp(second);
  expect((await api("POST", `/api/invitations/${created.data.invitation.code}/accept`, { as: "user" }, joiner.cookie)).status).toBe(200);
  return { creator, joiner, gameId: created.data.gameId, code: created.data.invitation.code };
}

describe("deleting the account without a game", () => {
  it("shows the panel, asks in a dialog with focus on the way out, and ends on the home page with the notice", async () => {
    const me = await signedUp(first);
    await openAccount(first);

    // s05.10: a danger zone, the button disabled with its reason.
    expect(await first.text("[data-testid=delete-account-panel]")).toContain("Tego nie da się cofnąć");
    expect(await first.evaluate<boolean>(`document.querySelector('${SUBMIT}').disabled`)).toBe(true);
    expect(await first.text("#delete-account-reason")).toBe("Zaznacz potwierdzenie, aby usunąć konto.");
    expect(await first.count("[data-testid=delete-account-waiting]")).toBe(0);
    expect(await first.count("[data-testid=delete-account-active-game]")).toBe(0);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "s05-10-domyslny-360");

    // The password and the checkbox enable the button; Esc and "Zostaw konto" close the dialog.
    await first.fill("#delete-account-password", PASSWORD);
    await first.click(CONFIRM);
    await first.waitForFn(`!document.querySelector('${SUBMIT}').disabled`);
    await shot(first, "s05-13-gotowe-360");
    await first.click(SUBMIT);
    await first.waitFor("[role=alertdialog]");
    expect(await first.text("[role=alertdialog]")).toContain(`Usunąć konto ${me.displayName}?`);
    expect(await first.text("[role=alertdialog]")).toContain("„Usunięty gracz”");
    expect(await focusedId(first)).toBe("Zostaw konto");
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "s05-14-dialog-360");
    await first.press("Escape");
    await dialogClosed(first);
    expect(await focusedId(first)).toBe("delete-account-submit");
    expect(await exists(me.id)).toBe(true);

    // Confirmed: a full reload on `/` with the closable notice and no session.
    await first.click(SUBMIT);
    await first.waitFor("[role=alertdialog]");
    await confirmInDialog(first);
    await first.waitForFn("location.pathname === '/' && location.search === '?notice=account-deleted'");
    await bodyHas(first, "Konto zostało usunięte");
    expect(await first.count("[data-testid=signed-in-as]")).toBe(0);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "s04-14-po-usunieciu-360");
    expect(await exists(me.id)).toBe(false);
    expect(await run(`select 1 from sessions where user_id = ?`, [me.id])).toHaveLength(0);
    await first.run("find", "text", "Zamknij", "click");
    await first.waitForFn("!document.body.innerText.includes('Konto zostało usunięte')");

    // The old session is gone: /account sends to the login page, and the data do not log in.
    await first.open(`${baseUrl}/account`);
    expect(await first.url()).toBe(`${baseUrl}/login?next=%2Faccount`);
    await first.fill("#login-email", me.email);
    await first.fill("#login-password", PASSWORD);
    await first.click("[data-testid=login-form] button[type=submit]");
    await bodyHas(first, "Nieprawidłowy e-mail lub hasło");
  });

  it("does not show the notice to a signed-in player who types the address", async () => {
    await signedUp(first);
    await first.open(`${baseUrl}/?notice=account-deleted`);
    await first.waitFor("[data-testid=signed-in-as]");
    expect(await first.evaluate<boolean>("document.body.innerText.includes('Konto zostało usunięte')")).toBe(false);
  });

  it("is usable in both themes at 360 px without horizontal scrolling", async () => {
    const me = await signedUp(first);
    for (const theme of ["dark", "light"] as const) {
      await giveCookie(first, me.cookie, theme);
      await openAccount(first, 360);
      expect(await first.evaluate<string>("document.documentElement.dataset.theme")).toBe(theme);
      expect(await horizontalOverflow(first)).toBe(false);
      await prepare(first);
      expect(await horizontalOverflow(first)).toBe(false);
      await first.press("Escape");
      await dialogClosed(first);
    }
    expect(await exists(me.id)).toBe(true);
  });

  it("asks for the password in the panel when it is empty (s05.16b)", async () => {
    await signedUp(first);
    await openAccount(first);
    await first.click(CONFIRM);
    await first.click(SUBMIT);
    await bodyHas(first, "Wpisz hasło.");
    expect(await dialogOpen(first)).toBe(false);
    expect(await first.evaluate<string>("document.getElementById('delete-account-password').getAttribute('aria-invalid')")).toBe("true");
    await first.waitForFn("document.activeElement?.id === 'delete-account-password'");
  });
});

describe("a wrong password and the limit", () => {
  it("closes the dialog, clears and focuses the field with the error, and keeps the account (s05.16)", async () => {
    const me = await signedUp(first);
    await openAccount(first);
    await prepare(first, "wrong-password-1");
    await confirmInDialog(first);
    await bodyHas(first, "Nieprawidłowe hasło.");
    await dialogClosed(first);
    expect(await first.evaluate<string>("document.getElementById('delete-account-password').value")).toBe("");
    expect(await first.evaluate<string>("document.getElementById('delete-account-password').getAttribute('aria-invalid')")).toBe("true");
    await first.waitForFn("document.activeElement?.id === 'delete-account-password'");
    expect(await first.evaluate<boolean>("document.body.innerText.includes('pozostało')")).toBe(false);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "s05-16-zle-haslo-360");
    expect(await exists(me.id)).toBe(true);
  });

  it("shows the limit with the wait time after 10 wrong passwords, and the right one does not help (s05.17)", async () => {
    const me = await signedUp(first);
    for (let i = 0; i < 10; i++) {
      expect((await api("POST", "/api/account/delete", { password: `wrong-${i}-pw`, confirm: true }, me.cookie)).status).toBe(400);
    }
    await openAccount(first);
    await prepare(first);
    await confirmInDialog(first);
    await first.waitFor("[data-testid=delete-account-error]");
    const text = await first.text("[data-testid=delete-account-error]");
    expect(text).toContain("Zbyt wiele prób");
    expect(text).toMatch(/Spróbuj ponownie za \d+ min\./);
    await dialogClosed(first);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "s05-17-limit-360");
    expect(await exists(me.id)).toBe(true);
  });

  it("keeps the dialog open on a network error and goes through on the retry (s05.18)", async () => {
    const me = await signedUp(first);
    await openAccount(first);
    await first.evaluate(`(() => {
      const real = window.fetch.bind(window);
      let failed = false;
      window.fetch = (url, init) => {
        if (String(url).endsWith('/api/account/delete') && !failed) { failed = true; return Promise.reject(new TypeError('offline')); }
        return real(url, init);
      };
      return true;
    })()`);
    await prepare(first);
    await confirmInDialog(first);
    await first.waitFor("[role=alertdialog] [role=alert]");
    expect(await first.text("[role=alertdialog] [role=alert]")).toBe("Nie udało się usunąć konta. Nic nie zostało zmienione. Spróbuj ponownie.");
    expect(await exists(me.id)).toBe(true);
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "s05-18-blad-360");

    await confirmInDialog(first);
    await first.waitForFn("location.search === '?notice=account-deleted'");
    expect(await exists(me.id)).toBe(false);
  });
});

describe("a game in progress (BR-21)", () => {
  it("blocks with a link to the game; resigning there frees the account, and the opponent sees a deleted player", async () => {
    const { creator, joiner, gameId } = await playingGame();
    // Both open the game, so the clock runs; the creator then goes to the account page.
    for (const browser of [first, second]) {
      await browser.setViewport(360, 900);
      await browser.open(`${baseUrl}/games/${gameId}`);
    }
    for (const browser of [first, second]) await bodyHas(browser, "Partia w toku");

    await openAccount(first);
    // s05.12: the block with the link and the way out; the button stays disabled.
    const block = "[data-testid=delete-account-active-game]";
    expect(await first.text(block)).toContain("Najpierw dokończ albo poddaj partię.");
    expect(await first.text(block)).toContain("Na stronie partii wybierz „Poddaj partię”, a potem odśwież tę stronę.");
    expect(await first.evaluate<string>(`document.querySelector('${block} a').getAttribute('href')`)).toBe(`/games/${gameId}`);
    await first.fill("#delete-account-password", PASSWORD);
    await first.click(CONFIRM);
    expect(await first.evaluate<boolean>(`document.querySelector('${SUBMIT}').disabled`)).toBe(true);
    expect(await first.text("#delete-account-reason")).toBe("Usunięcie jest możliwe dopiero po zakończeniu partii.");
    expect(await horizontalOverflow(first)).toBe(false);
    await shot(first, "s05-12-blokada-360");

    // Through the link to the game, resign, come back and refresh the page.
    // `.click()`, not a pointer click: at desktop width the link wraps and its box centre is empty.
    await first.evaluate("(() => { document.querySelector('[data-testid=delete-account-active-game] a').click(); return true; })()");
    await first.waitForFn(`location.pathname === '/games/${gameId}'`);
    await first.waitFor("[data-testid=resign]");
    await first.click("[data-testid=resign]");
    await first.waitFor("[role=alertdialog]");
    await confirmInDialog(first);
    await bodyHas(first, "Przegrałeś, poddałeś partię");

    await openAccount(first);
    expect(await first.count("[data-testid=delete-account-active-game]")).toBe(0);
    await prepare(first);
    await confirmInDialog(first);
    await first.waitForFn("location.search === '?notice=account-deleted'");
    expect(await exists(creator.id)).toBe(false);

    // The opponent sees the finished game with a deleted player.
    await bodyHas(second, "Koniec partii");
    await second.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(second, "Usunięty gracz");
    expect(await horizontalOverflow(second)).toBe(false);
    await shot(second, "s08-przeciwnik-360");
    expect(await exists(joiner.id)).toBe(true);
    expect((await run(`select status, end_reason from games where id = ?`, [gameId]))[0]).toEqual({
      status: "finished",
      end_reason: "resignation",
    });
  });

  it("shows the block when the game started after the page was loaded (409 from the server)", async () => {
    const creator = await signedUp(first);
    const created = (await (await api("POST", "/api/games", {}, creator.cookie)).json()) as {
      data: { invitation: { code: string }; gameId: string };
    };
    // The account holds a waiting game: the page warns about it, and deleting would remove it.
    await openAccount(first);
    expect(await first.text("[data-testid=delete-account-waiting]")).toBe(
      "Twoja oczekująca partia i jej zaproszenie zostaną usunięte.",
    );
    await shot(first, "s05-20-oczekujaca-360");
    await prepare(first);
    expect(await first.text("[role=alertdialog]")).toContain("Twoja oczekująca partia i jej zaproszenie zostaną usunięte.");
    // Meanwhile somebody joins: the game is in progress when the dialog is confirmed.
    const joiner = await signedUp(second);
    expect((await api("POST", `/api/invitations/${created.data.invitation.code}/accept`, { as: "user" }, joiner.cookie)).status).toBe(200);
    await confirmInDialog(first);
    await first.waitFor("[data-testid=delete-account-active-game]");
    await dialogClosed(first);
    expect(await first.evaluate<string>("document.querySelector('[data-testid=delete-account-active-game] a').getAttribute('href')")).toBe(
      `/games/${created.data.gameId}`,
    );
    await first.waitForFn("document.activeElement?.dataset?.testid === 'delete-account-active-game'");
    expect(await exists(creator.id)).toBe(true);
    await shot(first, "s05-12-blokada-po-409-360");
  });

  it("removes a waiting game together with the account, and the invitation stops working", async () => {
    const creator = await signedUp(first);
    const created = (await (await api("POST", "/api/games", {}, creator.cookie)).json()) as {
      data: { invitation: { code: string }; gameId: string };
    };
    await openAccount(first);
    await prepare(first);
    await confirmInDialog(first);
    await first.waitForFn("location.search === '?notice=account-deleted'");
    expect(await run(`select 1 from games where id = ?`, [created.data.gameId])).toHaveLength(0);

    await second.setViewport(360, 900);
    await second.open(`${baseUrl}/invite/${created.data.invitation.code}`);
    await bodyHas(second, "nieważne");
  });
});
