// The show's pages in a real browser (E14-S01, #280; show-mode P20 and the E15 note): the administrator starts a bot
// vs bot show from the console and lands on its view; "Widok pod projektor" by keyboard, kept in the address over a
// reload, defaulted from storage, switched off by ?projektor=0; ending the show; 320 px without horizontal scrolling
// in both themes and four languages.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { ADMIN_EMAIL, adminCreate } from "./admin";
import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(`${inject("browserSession")}-show`);
const ADMIN_PASSWORD = "Admin-pokaz-456";

let orm: Orm;
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Record<string, unknown>[]>(text, params);

async function loginCookie(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": "198.52.0.1" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  expect(response.status).toBe(200);
  return (response.headers.get("set-cookie") ?? "").split(";")[0]!;
}

async function createShow(cookie: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/show`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", cookie },
    body: JSON.stringify({ layout: "bot-bot", levels: [1, 1] }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { gameId: string } }).data.gameId;
}

let cookie = "";
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  await run(`delete from users where email = ?`, [ADMIN_EMAIL]);
  await adminCreate(ADMIN_PASSWORD, ["--name", "Szef_Pokazu"]);
  cookie = await loginCookie();
  await browser.open(`${baseUrl}/`);
  await browser.setCookie(cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1), baseUrl);
});
afterAll(async () => {
  await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
  await browser.close();
  await orm.close();
});
beforeEach(async () => {
  await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
  await run(`delete from rate_limit_buckets where "key" like 'show-create:%'`);
  await browser.setViewport(1280, 720);
  await browser.setCookie("gomoku_lang", "pl", baseUrl);
  await browser.setCookie("gomoku_theme", "dark", baseUrl);
});

const checked = () => browser.evaluate<string>(`document.querySelector('[data-testid="show-projector"]').getAttribute('aria-checked')`);
const boardWidth = () => browser.evaluate<number>(`Math.round(document.querySelector('[role="grid"]').getBoundingClientRect().width)`);

describe("the console", () => {
  it("starts a bot vs bot show and opens its view", async () => {
    await browser.open(`${baseUrl}/show`);
    await browser.waitFor('[data-testid="show-start"]');
    await browser.click('[data-testid="show-check"]');
    await browser.waitFor('[data-testid="show-checks"]');
    expect(await browser.text('[data-testid="show-checks"]')).toContain("Pokaz wystartuje.");

    await browser.click('[data-testid="show-start"]');
    await browser.waitForFn(`/\\/show\\/[0-9a-f-]{36}$/.test(location.pathname)`);

    expect(await browser.text("h1")).toBe("Pokaz: Bot vs bot");
    expect(await browser.count('[role="timer"]')).toBe(2);
    expect(await browser.text("main")).toContain("Bot · poziom 1");
  });

  it("shows the show in progress with the way back to it", async () => {
    const show = await createShow(cookie);
    await browser.open(`${baseUrl}/show`);

    expect(await browser.text('[data-testid="show-running"]')).toContain("Trwa pokaz");
    expect(await browser.evaluate<boolean>(`document.querySelector('[data-testid="show-start"]').disabled`)).toBe(true);
    await browser.click(`[data-testid="show-running"] a[href="/show/${show}"]`);
    await browser.waitForFn(`location.pathname === "/show/${show}"`);
  });
});

describe("Widok pod projektor (P20, criteria i-vii)", () => {
  it("is off without the parameter, toggled by keyboard and announced, kept in the address over a reload", async () => {
    const show = await createShow(cookie);
    await browser.open(`${baseUrl}/show/${show}`);
    await browser.evaluate(`localStorage.removeItem("gomoku.show.projector")`);
    await browser.open(`${baseUrl}/show/${show}`);
    await browser.waitFor('[data-testid="show-projector"]');

    // (i) normal layout: the board is at most --layout-width-board.
    expect(await checked()).toBe("false");
    expect(await boardWidth()).toBeLessThanOrEqual(448);

    // (v) keyboard and the live region.
    await browser.evaluate(`document.querySelector('[data-testid="show-projector"]').focus()`);
    await browser.press("Space");
    await browser.waitForFn(`location.search === "?projektor=1"`);
    expect(await checked()).toBe("true");
    expect(await browser.text('[data-testid="show-announcement"]')).toBe("Włączono widok pod projektor");
    expect(await browser.evaluate<boolean>(`document.activeElement === document.querySelector('[data-testid="show-projector"]')`)).toBe(true);

    // (ii) the projector board: min(80vh, 960px) = 576 px at 1280x720, bigger clocks.
    expect(await boardWidth()).toBe(576);
    expect(await browser.evaluate<string>(`getComputedStyle(document.querySelector('[role="timer"]')).fontSize`)).toBe("48px");
    expect(await browser.evaluate<number>(`Math.round(document.querySelector('[role="grid"]').getBoundingClientRect().bottom)`)).toBeLessThanOrEqual(720);
    // The page itself fits the screen: no vertical scrolling in the projector view (QA of #304).
    expect(await browser.evaluate<number>(`document.documentElement.scrollHeight`)).toBeLessThanOrEqual(720);

    // (iii) a reload keeps it, also with empty storage.
    await browser.evaluate(`localStorage.clear()`);
    await browser.open(`${baseUrl}/show/${show}?projektor=1`);
    await browser.waitFor('[data-testid="show-projector"]');
    expect(await checked()).toBe("true");

    // (vii) 1920x1080: the whole board fits.
    await browser.setViewport(1920, 1080);
    expect(await boardWidth()).toBe(864);
    expect(await browser.evaluate<number>(`Math.round(document.querySelector('[role="grid"]').getBoundingClientRect().bottom)`)).toBeLessThanOrEqual(1080);
  });

  it("defaults from storage without the parameter, and ?projektor=0 switches it off whatever storage says", async () => {
    const show = await createShow(cookie);
    await browser.open(`${baseUrl}/show/${show}`);
    await browser.evaluate(`localStorage.setItem("gomoku.show.projector", "1")`);

    await browser.open(`${baseUrl}/show/${show}`);
    await browser.waitForFn(`location.search === "?projektor=1"`);
    expect(await checked()).toBe("true");

    await browser.open(`${baseUrl}/show/${show}?projektor=0`);
    await browser.waitFor('[data-testid="show-projector"]');
    expect(await checked()).toBe("false");
    expect(await browser.url()).toBe(`${baseUrl}/show/${show}?projektor=0`);
    await browser.evaluate(`localStorage.removeItem("gomoku.show.projector")`);
  });
});

describe("ending the show", () => {
  it("asks first, then says the administrator ended it and offers a new show and logging out", async () => {
    const show = await createShow(cookie);
    await browser.open(`${baseUrl}/show/${show}`);
    await browser.click('[data-testid="show-end"]');
    await browser.waitFor('[role="alertdialog"]');
    await browser.click("[role=alertdialog] button:last-child");
    await browser.waitForFn(`document.body.textContent.includes("Pokaz zakończony przez administratora")`);

    expect(await browser.text("h1")).toBe("Koniec pokazu");
    expect(await browser.count('a[href="/show"]')).toBe(1);
    expect((await run(`select status from games where id = ?`, [show]))[0]!.status).toBe("cancelled");
  });
});

describe("320 px, both themes, four languages (E15 note e)", () => {
  it("never scrolls sideways, on the console and on the view", async () => {
    const show = await createShow(cookie);
    await browser.setViewport(320, 720);
    for (const theme of ["dark", "light"]) {
      await browser.setCookie("gomoku_theme", theme, baseUrl);
      for (const lang of ["pl", "en", "fr", "de"]) {
        await browser.setCookie("gomoku_lang", lang, baseUrl);
        for (const path of ["/show", `/show/${show}?projektor=0`]) {
          await browser.open(`${baseUrl}${path}`);
          await browser.waitFor("main h1");
          expect(await browser.evaluate<string>(`document.documentElement.lang`)).toBe(lang);
          expect(await browser.evaluate<string>(`document.documentElement.dataset.theme`)).toBe(theme);
          expect(await browser.evaluate<number>(`document.documentElement.scrollWidth`), `${theme} ${lang} ${path}`).toBeLessThanOrEqual(320);
        }
      }
    }
  });
});
