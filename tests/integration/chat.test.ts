// The game chat in two real browsers (E07-S01): an account and a guest write to each other in a game
// in progress and on the result screen, the opponent finds the message by polling (<= 3 s) without a
// reload, markup / bidi / SQL arrive as plain text, an address is refused in the form, a rematch starts
// with an empty chat and the setting on, either player can turn the chat off and on for themselves (E07-S02),
// a stranger gets 404, the answers are never cached and carry only the seat, and the
// server log never holds a message. Screenshots go to $GOMOKU_SHOTS_DIR in the theme $GOMOKU_SHOTS_THEME
// (default light) at 360, 320 and 1280 px.
import { readFileSync } from "node:fs";

import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";
import { SERVER_LOG } from "./global-setup";

const baseUrl = inject("baseUrl");
const first = new Browser(`${inject("browserSession")}-chat-a`);
const second = new Browser(`${inject("browserSession")}-chat-b`);
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
const nextAddress = () => `198.57.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

async function api(method: "GET" | "POST" | "PUT", path: string, body?: unknown, cookie?: string) {
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
const pairOf = (response: Response, name: string) =>
  (response.headers.getSetCookie?.() ?? []).find((line) => line.startsWith(`${name}=`))!.split(";")[0]!;

async function giveCookie(browser: Browser, pair: string, theme = shotsTheme) {
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", theme, baseUrl);
}

async function signUp() {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `chatpage-${n}@example.com`,
    displayName: `Cz_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return pairOf(response, "gomoku_session");
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const bodyLacks = (browser: Browser, text: string) =>
  browser.waitForFn(`!document.body.innerText.includes(${JSON.stringify(text)})`);
const overflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const FIELD = "input[name=message]";

/** Types into the chat field and sends with Enter, as a person would. */
async function say(browser: Browser, text: string) {
  await browser.fill(FIELD, text);
  await browser.press("Enter");
}
const logText = (browser: Browser) => browser.text("[role=log]");
async function shot(browser: Browser, name: string, widths = [360, 320, 1280]) {
  if (!shotsDir) return;
  for (const width of widths) {
    await browser.setViewport(width, 900);
    await browser.run("screenshot", "--full", `${shotsDir}/${name}-${width}-${shotsTheme}.png`);
  }
  await browser.setViewport(360, 900);
}

type Seat = { browser: Browser; cookie: string };
type Pair = { gameId: string; code: string; a: Seat; b: Seat };

/** `a` (an account) creates, `b` (a guest or an account) joins; both open the page and see the game in progress. */
async function activeGame(bKind: "guest" | "account" = "guest"): Promise<Pair> {
  const aCookie = await signUp();
  const created = await api("POST", "/api/games", {}, aCookie);
  expect(created.status).toBe(201);
  const { gameId, invitation } = ((await created.json()) as { data: { gameId: string; invitation: { code: string } } }).data;
  let bCookie: string;
  if (bKind === "guest") {
    const joined = await api("POST", `/api/invitations/${invitation.code}/accept`, { as: "guest", acknowledgedGuestWarning: true, nickname: "Zuza" });
    expect(joined.status).toBe(200);
    bCookie = pairOf(joined, "gomoku_guest");
  } else {
    bCookie = await signUp();
    expect((await api("POST", `/api/invitations/${invitation.code}/accept`, { as: "user" }, bCookie)).status).toBe(200);
  }
  const a: Seat = { browser: first, cookie: aCookie };
  const b: Seat = { browser: second, cookie: bCookie };
  for (const seat of [a, b]) {
    await giveCookie(seat.browser, seat.cookie);
    await seat.browser.setViewport(360, 900);
    await seat.browser.open(`${baseUrl}/games/${gameId}`);
  }
  for (const seat of [a, b]) {
    await bodyHas(seat.browser, "Partia w toku");
    await seat.browser.waitFor(FIELD);
  }
  return { gameId, code: invitation.code, a, b };
}

describe("chat in the browser", () => {
  it("an account and a guest write to each other in the game and on the result screen", async () => {
    const { gameId, a, b } = await activeGame();

    await bodyHas(a.browser, "Nikt jeszcze nic nie napisał. Napisz pierwszy.");
    expect(await a.browser.evaluate<boolean>(`document.activeElement === document.body`)).toBe(true);
    await shot(a.browser, "czat-pusty");

    await say(a.browser, "Cześć, gramy?");
    // The sender sees it after the server confirmed it; the opponent finds it by polling, with no reload.
    await bodyHas(a.browser, "Cześć, gramy?");
    await bodyHas(b.browser, "Cześć, gramy?");
    expect(await logText(b.browser)).toContain("Cz_");
    expect(await a.browser.evaluate<string>(`document.querySelector('${FIELD}').value`)).toBe("");

    await say(b.browser, "Jasne 🙂 powodzenia");
    await bodyHas(a.browser, "Jasne 🙂 powodzenia");
    expect(await logText(a.browser)).toContain("Zuza");
    expect(await logText(b.browser)).toMatch(/Ty:\s*Zuza\s*\(gość\)/);
    await shot(a.browser, "czat-rozmowa");
    expect(await overflow(a.browser)).toBe(false);

    // The result screen keeps the chat for an hour (BR-34).
    expect((await api("POST", `/api/games/${gameId}/resign`, undefined, a.cookie)).status).toBe(200);
    for (const seat of [a, b]) await bodyHas(seat.browser, "Koniec partii");
    expect(await a.browser.count("[data-testid=chat-panel]")).toBe(1);
    expect(await logText(b.browser)).toContain("Cześć, gramy?");
    await say(b.browser, "Dobra partia!");
    await bodyHas(a.browser, "Dobra partia!");
    await shot(b.browser, "czat-wynik");
    expect(await overflow(b.browser)).toBe(false);
  });

  it("shows markup, bidi marks and SQL as plain text and refuses an address in the form", async () => {
    const { a, b } = await activeGame();
    const markup = `<img src=x onerror="document.title='pwn'"> <b>pogrubione</b>`;

    await say(a.browser, markup);
    await bodyHas(b.browser, "pogrubione");

    expect(await logText(b.browser)).toContain(markup);
    expect(await b.browser.count("[role=log] img, [role=log] b, [role=log] a")).toBe(0);
    expect(await b.browser.title()).not.toBe("pwn");

    await say(a.browser, "'; drop table chat_messages; -- שלום");
    await bodyHas(b.browser, "drop table chat_messages");
    expect((await run("select count(*)::int as n from chat_messages"))[0]!.n).toBeGreaterThan(0);

    await say(a.browser, "zobacz example.com");
    await bodyHas(a.browser, "Wiadomość nie może zawierać adresów internetowych.");
    expect(await a.browser.evaluate<string>(`document.querySelector('${FIELD}').value`)).toBe("zobacz example.com");
    expect(await logText(b.browser)).not.toContain("example.com");
    await shot(a.browser, "czat-adres-odrzucony", [360]);
  });

  it("lets keys typed in the field leave the board alone, and sends a message with Enter only", async () => {
    const { gameId, a } = await activeGame();
    await a.browser.click(FIELD);
    await a.browser.press("ArrowRight");
    await a.browser.press("Space");
    await a.browser.press("Enter");

    const moves = await run("select move_count from games where id = ?", [gameId]);
    expect(moves[0]!.move_count).toBe(0);
    expect(await a.browser.count("[data-testid=chat-message]")).toBe(0);
  });

  it("keeps a 200-character message with no spaces inside the screen at every width and in both themes", async () => {
    const { gameId, a, b } = await activeGame();
    await say(a.browser, "w".repeat(200));
    await bodyHas(b.browser, "w".repeat(200));

    for (const theme of ["light", "dark"] as const) {
      for (const seat of [a, b]) {
        await giveCookie(seat.browser, seat.cookie, theme);
        await seat.browser.open(`${baseUrl}/games/${gameId}`);
        await bodyHas(seat.browser, "w".repeat(200));
        for (const width of [320, 360, 1280]) {
          await seat.browser.setViewport(width, 900);
          expect(await overflow(seat.browser)).toBe(false);
        }
      }
    }
    await shot(a.browser, "czat-dluga-wiadomosc");
  });

  it("folds the panel away and unfolds it, keeping the conversation", async () => {
    const { a, b } = await activeGame();
    await say(b.browser, "pierwsza");
    await bodyHas(a.browser, "pierwsza");

    await a.browser.click("[data-testid=chat-toggle]");
    await bodyLacks(a.browser, "Wiadomość");
    expect(await a.browser.text("[data-testid=chat-toggle]")).toBe("Rozwiń czat");
    await say(b.browser, "druga");
    await a.browser.waitForFn(`document.querySelector('[data-testid=chat-toggle]').textContent === 'Czat (1 nowa)'`);

    await a.browser.click("[data-testid=chat-toggle]");
    await bodyHas(a.browser, "druga");
    expect(await a.browser.text("[data-testid=chat-toggle]")).toBe("Zwiń czat");
  });

  it("starts a rematch with an empty chat and the setting on", async () => {
    const { gameId, a, b } = await activeGame("account");
    await say(a.browser, "przed rewanżem");
    await bodyHas(b.browser, "przed rewanżem");
    expect((await api("PUT", `/api/games/${gameId}/chat/settings`, { enabled: false }, a.cookie)).status).toBe(200);
    expect((await api("POST", `/api/games/${gameId}/resign`, undefined, a.cookie)).status).toBe(200);
    for (const seat of [a, b]) await bodyHas(seat.browser, "Koniec partii");

    expect((await api("POST", `/api/games/${gameId}/rematch`, undefined, a.cookie)).status).toBeLessThan(300);
    expect((await api("POST", `/api/games/${gameId}/rematch/accept`, undefined, b.cookie)).status).toBeLessThan(300);
    for (const seat of [a, b]) await seat.browser.waitForFn(`location.pathname !== '/games/${gameId}'`);
    for (const seat of [a, b]) {
      await bodyHas(seat.browser, "Partia w toku");
      await bodyHas(seat.browser, "Nikt jeszcze nic nie napisał. Napisz pierwszy.");
    }
    const newId = (await a.browser.url()).split("/games/")[1]!;
    expect(newId).not.toBe(gameId);
    const settings = await run("select chat_enabled from game_players where game_id = ?", [newId]);
    expect(settings.map((row) => row.chat_enabled)).toEqual([true, true]);
    expect((await run("select count(*)::int as n from chat_messages where game_id = ?", [newId]))[0]!.n).toBe(0);
  });

  it("lets one player turn the chat off for themselves, tells the other, and brings the conversation back when it is on again", async () => {
    const { gameId, a, b } = await activeGame();
    const SWITCH = "[data-testid=chat-switch]";
    await say(a.browser, "zanim wyłączę");
    await bodyHas(b.browser, "zanim wyłączę");
    expect(await a.browser.text(SWITCH)).toBe("Wyłącz czat");

    await a.browser.click(SWITCH);
    await bodyHas(a.browser, "Wyłączyłeś czat. Nie widzisz wiadomości rozmówcy i nie możesz pisać.");
    expect(await a.browser.count("[role=log]")).toBe(0);
    expect(await a.browser.count(FIELD)).toBe(0);
    expect(await a.browser.text(SWITCH)).toBe("Włącz czat");
    // The focus stays on the same button, so the keyboard user is not thrown out.
    expect(await a.browser.evaluate<string | null>(`document.activeElement?.getAttribute('data-testid') ?? null`)).toBe("chat-switch");
    await shot(a.browser, "czat-wylaczony-przez-ciebie", [360, 320]);

    // The other player learns by polling, still reads the talk, cannot write, and can turn it off too.
    await bodyHas(b.browser, "Rozmówca wyłączył czat. Nie możesz teraz pisać.");
    expect(await logText(b.browser)).toContain("zanim wyłączę");
    expect(await b.browser.evaluate<boolean>(`document.querySelector('${FIELD}').disabled`)).toBe(true);
    expect(await b.browser.text(SWITCH)).toBe("Wyłącz czat");
    await shot(b.browser, "czat-wylaczony-przez-rozmowce", [360, 320]);

    // The setting is the game's, not the page's: a reload keeps it.
    await a.browser.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(a.browser, "Wyłączyłeś czat.");
    expect(await a.browser.text(SWITCH)).toBe("Włącz czat");

    await a.browser.click(SWITCH);
    await bodyHas(a.browser, "zanim wyłączę");
    expect(await a.browser.text(SWITCH)).toBe("Wyłącz czat");
    await b.browser.waitForFn(`document.querySelector('${FIELD}') && !document.querySelector('${FIELD}').disabled`);
    await say(b.browser, "już mogę");
    await bodyHas(a.browser, "już mogę");
  });

  it("shows who turned it off when both did and one turns it on", async () => {
    const { a, b } = await activeGame();
    const SWITCH = "[data-testid=chat-switch]";
    await a.browser.click(SWITCH);
    await bodyHas(a.browser, "Wyłączyłeś czat.");
    await bodyHas(b.browser, "Rozmówca wyłączył czat.");
    await b.browser.click(SWITCH);
    await bodyHas(b.browser, "Wyłączyłeś czat.");

    await a.browser.click(SWITCH);
    await bodyHas(a.browser, "Rozmówca wyłączył czat. Nie możesz teraz pisać.");
    expect(await a.browser.evaluate<boolean>(`document.querySelector('${FIELD}').disabled`)).toBe(true);
    expect(await b.browser.text("[data-testid=chat-switch]")).toBe("Włącz czat");
    expect(await b.browser.count(FIELD)).toBe(0);
  });

  it("works from the keyboard and fits a 320 px screen", async () => {
    const { a } = await activeGame();
    await a.browser.setViewport(320, 900);
    expect(await overflow(a.browser)).toBe(false);
    await a.browser.evaluate(`document.querySelector('[data-testid=chat-switch]').focus()`);
    await a.browser.press("Enter");
    await bodyHas(a.browser, "Wyłączyłeś czat.");
    expect(await overflow(a.browser)).toBe(false);
    await a.browser.press("Space");
    await bodyLacks(a.browser, "Wyłączyłeś czat.");
    expect(await a.browser.evaluate<string>(`document.activeElement.getAttribute('data-testid')`)).toBe("chat-switch");
    expect(await a.browser.evaluate<number>(`document.querySelector('[data-testid=chat-switch]').getBoundingClientRect().height`)).toBeGreaterThanOrEqual(44);
    await a.browser.setViewport(360, 900);
  });
});

describe("chat API", () => {
  it("answers a stranger and a game that does not exist with the same 404, and a participant with the seat only", async () => {
    const { gameId, a, b } = await activeGame();
    const stranger = await signUp();
    const missing = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

    for (const cookie of [stranger, undefined]) {
      const response = await api("GET", `/api/games/${gameId}/chat`, undefined, cookie);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    const unknown = await api("GET", `/api/games/${missing}/chat`, undefined, stranger);
    expect(unknown.status).toBe(404);
    expect((await api("POST", `/api/games/${gameId}/chat`, { text: "hej", clientId: crypto.randomUUID() }, stranger)).status).toBe(404);

    const sent = await api("POST", `/api/games/${gameId}/chat`, { text: "Hej", clientId: crypto.randomUUID() }, a.cookie);
    expect(sent.status).toBe(201);
    expect(sent.headers.get("cache-control")).toBe("no-store");
    const { data: created } = (await sent.json()) as { data: { message: Record<string, unknown>; retryAfterMs: number } };
    expect(Object.keys(created.message).sort()).toEqual(["createdAt", "id", "seat", "text"]);
    expect(created).toMatchObject({ message: { id: 1, seat: 1, text: "Hej" }, retryAfterMs: 2000 });

    const read = await api("GET", `/api/games/${gameId}/chat`, undefined, b.cookie);
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(read.headers.get("etag")).toBeNull();
    const { data } = (await read.json()) as { data: Record<string, unknown> };
    expect(data).toMatchObject({ state: "open", lastId: 1, limits: { maxLength: 200, minIntervalMs: 2000 } });
    expect(JSON.stringify(data)).not.toMatch(/@example\.com|userId|user_id|email/i);
    const after = await api("GET", `/api/games/${gameId}/chat?after_id=1`, undefined, b.cookie);
    expect(((await after.json()) as { data: { messages: unknown[]; lastId: number } }).data).toMatchObject({ messages: [], lastId: 1 });
  });

  it("validates the input and the state: 400 with the field error, 403 without CSRF, 429 with Retry-After, idempotent retries", async () => {
    const { gameId, a, b } = await activeGame();
    const clientId = crypto.randomUUID();

    const noCsrf = await fetch(`${baseUrl}/api/games/${gameId}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: a.cookie, origin: baseUrl },
      body: JSON.stringify({ text: "x", clientId }),
    });
    expect(noCsrf.status).toBe(403);

    for (const [text, reason] of [
      ["zobacz https://example.com", "url"],
      ["a‮b", "invisible_char"],
      ["a​b", "invisible_char"],
      ["a\nb", "control_char"],
      ["a".repeat(201), "too_long"],
      ["   ", "empty"],
    ] as const) {
      const response = await api("POST", `/api/games/${gameId}/chat`, { text, clientId: crypto.randomUUID() }, a.cookie);
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: { fieldErrors: { text: string[] }; data: { reason: string } } };
      expect(body.error.data.reason).toBe(reason);
      expect(body.error.fieldErrors.text).toHaveLength(1);
      expect(JSON.stringify(body)).not.toContain("example.com");
    }
    expect((await api("GET", `/api/games/${gameId}/chat?after_id=2147483648`, undefined, a.cookie)).status).toBe(400);
    expect((await api("GET", `/api/games/${gameId}/chat?after_id=-1`, undefined, a.cookie)).status).toBe(400);

    expect((await api("POST", `/api/games/${gameId}/chat`, { text: "raz", clientId }, a.cookie)).status).toBe(201);
    // The same attempt again, even immediately: the stored message, no duplicate, no limit spent.
    const again = await api("POST", `/api/games/${gameId}/chat`, { text: "raz", clientId }, a.cookie);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { data: { message: { id: number } } }).data.message.id).toBe(1);
    // A new message at once is too soon.
    const tooSoon = await api("POST", `/api/games/${gameId}/chat`, { text: "dwa", clientId: crypto.randomUUID() }, a.cookie);
    expect(tooSoon.status).toBe(429);
    expect(Number(tooSoon.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await tooSoon.json()) as { error: { code: string; data: { retryAfterMs: number } } }).error).toMatchObject({
      code: "RATE_LIMITED",
      data: { retryAfterMs: expect.any(Number) },
    });
    // The other player has their own interval.
    expect((await api("POST", `/api/games/${gameId}/chat`, { text: "ja", clientId: crypto.randomUUID() }, b.cookie)).status).toBe(201);
  });

  it("answers CHAT_UNAVAILABLE in a game that waits", async () => {
    const aCookie = await signUp();
    const created = await api("POST", "/api/games", {}, aCookie);
    const { gameId } = ((await created.json()) as { data: { gameId: string } }).data;

    const read = await api("GET", `/api/games/${gameId}/chat`, undefined, aCookie);
    expect(((await read.json()) as { data: { state: string; messages: unknown[] } }).data).toMatchObject({ state: "unavailable", messages: [] });
    const send = await api("POST", `/api/games/${gameId}/chat`, { text: "hej", clientId: crypto.randomUUID() }, aCookie);
    expect(send.status).toBe(409);
    expect(((await send.json()) as { error: { code: string } }).error.code).toBe("CHAT_UNAVAILABLE");
  });
});

describe("chat settings API", () => {
  it("sets the chat for the caller only, answers with the state, is idempotent and refuses what it should", async () => {
    const { gameId, a, b } = await activeGame();
    const url = `/api/games/${gameId}/chat/settings`;
    const stranger = await signUp();

    const off = await api("PUT", url, { enabled: false }, a.cookie);
    expect(off.status).toBe(200);
    expect(off.headers.get("cache-control")).toBe("no-store");
    expect(await off.json()).toEqual({ ok: true, data: { state: "disabled_by_you" } });
    expect(await (await api("PUT", url, { enabled: false }, a.cookie)).json()).toEqual({ ok: true, data: { state: "disabled_by_you" } });
    expect(await (await api("PUT", url, { enabled: true }, b.cookie)).json()).toEqual({ ok: true, data: { state: "disabled_by_opponent" } });
    const settings = await run("select seat, chat_enabled from game_players where game_id = ? order by seat", [gameId]);
    expect(settings.map((row) => row.chat_enabled)).toEqual([false, true]);

    for (const body of [{}, { enabled: "false" }, { enabled: 0 }, { enabled: true, extra: 1 }]) {
      const bad = await api("PUT", url, body, a.cookie);
      expect(bad.status).toBe(400);
      expect(bad.headers.get("cache-control")).toBe("no-store");
    }
    const noCsrf = await fetch(`${baseUrl}${url}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: a.cookie, origin: baseUrl },
      body: JSON.stringify({ enabled: true }),
    });
    expect(noCsrf.status).toBe(403);
    expect((await api("PUT", url, { enabled: true }, stranger)).status).toBe(404);
    expect((await api("PUT", url, { enabled: true })).status).toBe(404);
    expect((await api("PUT", "/api/games/4d293981-7b3c-4f81-a1af-0a9e3bf3636b/chat/settings", { enabled: true }, stranger)).status).toBe(404);
  });

  it("answers CHAT_UNAVAILABLE in a game that waits", async () => {
    const aCookie = await signUp();
    const created = await api("POST", "/api/games", {}, aCookie);
    const { gameId } = ((await created.json()) as { data: { gameId: string } }).data;
    const response = await api("PUT", `/api/games/${gameId}/chat/settings`, { enabled: false }, aCookie);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("CHAT_UNAVAILABLE");
  });
});

describe("the server log", () => {
  it("holds neither the text of a message nor the id of an attempt", async () => {
    const { gameId, a } = await activeGame();
    const text = `logprobe ${Date.now().toString(36)}`;
    const clientId = crypto.randomUUID();
    await api("POST", `/api/games/${gameId}/chat`, { text, clientId }, a.cookie);
    await api("POST", `/api/games/${gameId}/chat`, { text: `${text} example.com`, clientId: crypto.randomUUID() }, a.cookie);
    await api("POST", `/api/games/${gameId}/chat`, { text: "x".repeat(2000), clientId }, a.cookie);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const log = readFileSync(SERVER_LOG, "utf8");

    expect(log).not.toContain(text);
    expect(log).not.toContain(clientId);
  });
});
