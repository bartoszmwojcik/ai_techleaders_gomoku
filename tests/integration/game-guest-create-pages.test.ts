// A visitor without an account creates a game in a real browser (E02-S08, step 6): the button on
// the home page, the p08 form, the code card with the permanent warning, an account and a guest
// who join through the link, play to the end with "{nick} (gość)", BR-13 with its dialog, the
// address limit, "Masz partię" after the tab was closed and the expiry window of one hour.
// Several browser sessions play the different people.
import { CREATE_GAME_LIMIT } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

// Two browsers and a game to the end: longer than the default 30 s.
const LONG = 120_000;

const baseUrl = inject("baseUrl");
const creator = new Browser(inject("browserSession"));
const joiner = new Browser(`${inject("browserSession")}-joiner`);
const other = new Browser(`${inject("browserSession")}-other`);
const browsers = [creator, joiner, other];

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  for (const browser of browsers) await browser.clearCookies();
});
afterAll(async () => {
  await orm.close();
  for (const browser of browsers) {
    await browser.setHeaders({});
    await browser.clearCookies();
  }
  await joiner.close();
  await other.close();
});
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Record<string, unknown>[]>(text, params);

let counter = 0;
const nextAddress = () => `198.52.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
/** Every person gets an own client address: the creation limit is per address. */
async function visitor(browser: Browser, address = nextAddress()) {
  await browser.setHeaders({ "x-forwarded-for": address });
  await browser.clearCookies();
  await browser.setViewport(1280, 900);
}

async function api(method: "GET" | "POST", path: string, body?: unknown, cookie?: string, address = nextAddress()) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": address,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signedUp(browser: Browser) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `guestpages-${n}@example.com`,
    displayName: `GP_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  return pair;
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const click = (browser: Browser, text: string) => browser.run("find", "text", text, "click", "--exact");
const pathOf = async (browser: Browser) => new URL(await browser.url()).pathname;
const gamePath = async (browser: Browser) => {
  await browser.waitForFn("location.pathname.startsWith('/games/')");
  return pathOf(browser);
};
/** A guest's name is split over spans (innerText breaks lines there), so read `textContent`. */
const nameShown = (browser: Browser, label: string) =>
  browser.waitForFn(
    `[...document.querySelectorAll('[data-testid=player-name]')].some((n) => n.textContent.endsWith(${JSON.stringify(label)}))`,
  );
const codeOf = (browser: Browser) => browser.evaluate<string>("document.querySelectorAll('dd')[1].textContent");
const cookieHeader = async (browser: Browser) =>
  (await browser.cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");

/** The creator-guest's browser: home, "Zagraj ze znajomym bez konta", the form, the created game. */
async function createAsGuest(browser: Browser, nickname?: string) {
  await browser.open(`${baseUrl}/`);
  await click(browser, "Zagraj ze znajomym bez konta");
  await browser.waitFor("#guest-nickname");
  if (nickname) await browser.fill("#guest-nickname", nickname);
  await browser.click("[data-testid=guest-create]");
  const path = await gamePath(browser);
  await bodyHas(browser, "Czekamy na przeciwnika…");
  return path;
}

async function playToTheEnd(gameId: string, seat1: string, seat2: string) {
  const [game] = await run(`select black_seat from games where id = ?`, [gameId]);
  const [black, white] = game!.black_seat === 1 ? [seat1, seat2] : [seat2, seat1];
  const blackMoves = [3, 4, 5, 6, 7];
  let number = 0;
  for (const [index, x] of blackMoves.entries()) {
    expect((await api("POST", `/api/games/${gameId}/moves`, { x, y: 7, moveNumber: ++number }, black)).status).toBe(200);
    if (index < 4) {
      expect((await api("POST", `/api/games/${gameId}/moves`, { x: index, y: 0, moveNumber: ++number }, white)).status).toBe(200);
    }
  }
  return game!.black_seat as 1 | 2;
}

describe("a guest creates a game", () => {
  it("offers the button on the home page, creates the game, and an account joins and plays to the end", async () => {
    await visitor(creator);
    await creator.open(`${baseUrl}/`);
    // L34: a secondary button below the main actions, "Załóż konto" stays the main one.
    expect(await creator.count("a[href='/play']")).toBe(1);
    expect(await creator.text("main")).toContain("Zagraj ze znajomym bez konta");
    expect(await creator.count("a[href='/register']")).toBe(1);

    await click(creator, "Zagraj ze znajomym bez konta");
    await creator.waitFor("#guest-nickname");
    expect(await pathOf(creator)).toBe("/play");
    const form = await creator.text("main");
    expect(form).toContain("Zostaw puste, a będziesz „Gracz 1”");
    expect(form).toContain("Jeśli zmienisz przeglądarkę albo wyczyścisz dane, stracisz dostęp do tej partii.");
    expect(form).toContain("Zaproszenie jest ważne 24 godziny.");

    await creator.fill("#guest-nickname", "Ala");
    await creator.click("[data-testid=guest-create]");
    const path = await gamePath(creator);
    await bodyHas(creator, "Czekamy na przeciwnika…");
    const text = await creator.text("main");
    expect(text).toContain("Partia czeka na przeciwnika");
    expect(text).toContain("Nie zmieniaj przeglądarki, bo stracisz dostęp do partii.");
    const code = await codeOf(creator);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // An account opens the link: the invitation names the creator as a guest (s07.11).
    await visitor(joiner);
    const bob = await signedUp(joiner);
    await joiner.open(`${baseUrl}/invite/${code}`);
    await joiner.waitFor("[data-testid=invite-page]");
    expect(await joiner.text("main")).toContain("Ala (gość) zaprasza Cię do partii Gomoku");
    await click(joiner, "Dołącz do partii");
    expect(await gamePath(joiner)).toBe(path);

    await bodyHas(creator, "Partia w toku");
    const names = await creator.evaluate<string[]>("[...document.querySelectorAll('[data-testid=player-name]')].map((n) => n.textContent)");
    expect(names).toEqual(["Ty: Ala (gość)"]);

    const gameId = path.split("/")[2]!;
    await playToTheEnd(gameId, await cookieHeader(creator), bob);
    await creator.waitForFn("/Wygrałeś|Przegrałeś/.test(document.body.innerText)");
    await nameShown(creator, "Ala (gość)");
    const finished = await run(`select status from games where id = ?`, [gameId]);
    expect(finished).toEqual([{ status: "finished" }]);
    // The browsers are free: the creator reaches the form again, "Masz partię" is gone.
    await creator.open(`${baseUrl}/`);
    expect(await creator.text("main")).not.toContain("Masz partię");
  }, LONG);

  it("meets a guest joiner, who sees the guest creator by nickname; both are guests to the end", async () => {
    await visitor(creator);
    const path = await createAsGuest(creator, "Kasia");
    const code = await codeOf(creator);

    await visitor(joiner);
    await joiner.open(`${baseUrl}/invite/${code}`);
    await joiner.waitFor("[data-testid=invite-page]");
    expect(await joiner.text("main")).toContain("Kasia (gość) zaprasza Cię do partii Gomoku");
    await click(joiner, "Graj jako gość");
    await joiner.fill("#invite-nickname", "Olek");
    await click(joiner, "Rozumiem, graj jako gość");
    expect(await gamePath(joiner)).toBe(path);

    await bodyHas(creator, "Partia w toku");
    await bodyHas(joiner, "Partia w toku");
    const gameId = path.split("/")[2]!;
    await playToTheEnd(gameId, await cookieHeader(creator), await cookieHeader(joiner));
    await nameShown(joiner, "Kasia (gość)");
    await nameShown(creator, "Olek (gość)");
  }, LONG);

  it("does not let the creator open the own link as a joiner: the page leads back to the game", async () => {
    await visitor(creator);
    const path = await createAsGuest(creator);
    const code = await codeOf(creator);
    await creator.open(`${baseUrl}/invite/${code}`);
    expect(await gamePath(creator)).toBe(path);
  });
});

describe("BR-13 for a guest", () => {
  it("offers to cancel the own waiting game from the form, behind a dialog (p08.7)", async () => {
    await visitor(creator);
    const first = await createAsGuest(creator, "Ala");

    await creator.open(`${baseUrl}/play`);
    await creator.waitFor("#guest-nickname");
    await creator.click("[data-testid=guest-create]");
    await bodyHas(creator, "Masz oczekującą partię");
    expect(await creator.count(`a[href='${first}']`)).toBe(1);

    await click(creator, "Anuluj i utwórz nową");
    await bodyHas(creator, "Anulować poprzednie zaproszenie?");
    await click(creator, "Tak, anuluj i utwórz nową");
    await creator.waitForFn(`location.pathname.startsWith('/games/') && location.pathname !== ${JSON.stringify(first)}`);
    await bodyHas(creator, "Czekamy na przeciwnika…");
    const [old] = await run(`select status from games where id = ?`, [first.split("/")[2]]);
    expect(old).toEqual({ status: "cancelled" });
  });

  it("refuses a guest in a game in progress, with a link to it (p08.6)", async () => {
    await visitor(creator);
    const path = await createAsGuest(creator);
    const code = await codeOf(creator);
    const bob = await signedUp(joiner);
    expect((await api("POST", `/api/invitations/${code}/accept`, { as: "user" }, bob)).status).toBe(200);

    await creator.open(`${baseUrl}/play`);
    await creator.waitFor("#guest-nickname");
    await creator.click("[data-testid=guest-create]");
    await bodyHas(creator, "Masz już partię");
    expect(await creator.count(`a[href='${path}']`)).toBe(1);
  });

  it("lets a guest creator give up the waiting game to join another invitation (s07.7, L35)", async () => {
    await visitor(creator);
    const mine = await createAsGuest(creator);
    await visitor(other);
    await createAsGuest(other, "Ola");
    const code = await codeOf(other);

    await creator.open(`${baseUrl}/invite/${code}`);
    await creator.waitFor("[data-testid=invite-page]");
    expect(await creator.text("main")).toContain("Masz oczekującą partię");
    await click(creator, "Anuluj moją partię i dołącz");
    await creator.waitForFn(`location.pathname.startsWith('/games/') && location.pathname !== ${JSON.stringify(mine)}`);
    const [old] = await run(`select status from games where id = ?`, [mine.split("/")[2]]);
    expect(old).toEqual({ status: "cancelled" });
  });
});

describe("the form's errors", () => {
  it("shows the nickname error next to the field and keeps the text (p08.2)", async () => {
    await visitor(creator);
    await creator.open(`${baseUrl}/play`);
    await creator.waitFor("#guest-nickname");
    await creator.fill("#guest-nickname", "<b>");
    await creator.click("[data-testid=guest-create]");
    await bodyHas(creator, "Nick może zawierać litery, cyfry, spacje oraz znaki _ i -.");
    expect(await creator.evaluate<string>("document.querySelector('#guest-nickname').value")).toBe("<b>");
    expect(await pathOf(creator)).toBe("/play");
  });

  it("shows the address limit with the wait (p08.4)", async () => {
    const address = nextAddress();
    for (let i = 0; i < CREATE_GAME_LIMIT; i += 1) {
      expect((await api("POST", "/api/games", { acknowledgedGuestWarning: true }, undefined, address)).status).toBe(201);
    }
    await visitor(creator, address);
    await creator.open(`${baseUrl}/play`);
    await creator.waitFor("#guest-nickname");
    await creator.click("[data-testid=guest-create]");
    await bodyHas(creator, "Zbyt wiele zaproszeń");
    expect(await creator.text("main")).toContain(`Limit to ${CREATE_GAME_LIMIT} utworzeń na godzinę.`);
    expect(await creator.text("main")).toMatch(/Spróbuj ponownie za \d+ min\./);
  });

  it("tells a signed-in user to create from the home page", async () => {
    await visitor(creator);
    await signedUp(creator);
    await creator.open(`${baseUrl}/play`);
    await bodyHas(creator, "Jesteś zalogowany");
    expect(await creator.count("#guest-nickname")).toBe(0);
  });
});

describe("coming back and expiry", () => {
  it("reminds the guest of the waiting game on the home page after the tab was closed (p01.9)", async () => {
    await visitor(creator);
    const path = await createAsGuest(creator);
    await creator.open(`${baseUrl}/`);
    await bodyHas(creator, "Masz partię");
    expect(await creator.text("main")).toContain("Czekasz na przeciwnika.");
    expect(await creator.count(`a[href='${path}']`)).toBe(1);
    // The reminder also appears for a joined game in progress.
    const code = await (async () => {
      await creator.open(`${baseUrl}${path}`);
      await creator.waitFor("dd");
      return codeOf(creator);
    })();
    const bob = await signedUp(joiner);
    expect((await api("POST", `/api/invitations/${code}/accept`, { as: "user" }, bob)).status).toBe(200);
    await creator.open(`${baseUrl}/`);
    await bodyHas(creator, "Partia w toku.");
  });

  it("shows \"Zaproszenie wygasło\" for an hour after the expiry, then 404 (p03.13, L29)", async () => {
    await visitor(creator);
    const path = await createAsGuest(creator);
    const gameId = path.split("/")[2]!;
    await run(`update invitations set expires_at = now() - interval '5 minutes' where game_id = ?`, [gameId]);

    await creator.open(`${baseUrl}${path}`);
    await bodyHas(creator, "Zaproszenie wygasło");
    expect(await creator.count("a[href='/play']")).toBeGreaterThan(0);
    await creator.open(`${baseUrl}/`);
    expect(await creator.text("main")).not.toContain("Masz partię");

    await run(`update invitations set expires_at = now() - interval '61 minutes' where game_id = ?`, [gameId]);
    await creator.open(`${baseUrl}${path}`);
    await bodyHas(creator, "Ta partia nie istnieje albo nie masz do niej dostępu");
  });

  it("cancels from the game page and comes back to the home page with the notice (p03.6)", async () => {
    await visitor(creator);
    await createAsGuest(creator);
    await click(creator, "Anuluj zaproszenie");
    await bodyHas(creator, "Anulować zaproszenie?");
    await click(creator, "Tak, anuluj zaproszenie");
    await creator.waitForFn("location.pathname === '/'");
    await bodyHas(creator, "Zaproszenie anulowane");
    expect(await creator.text("main")).not.toContain("Masz partię");
  });
});
