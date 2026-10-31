// The rematch in two real browsers (E02-S06, #88 step 5; p06.10-p06.15): the offer, the wait with
// its countdown, the opponent's offer found by polling, acceptance (both land in the new game with
// the colours swapped), refusal, withdrawal, expiry (the clock of the offer moved in the database),
// 409 ACTIVE_GAME_EXISTS with the link to the player's own game, and the guest's token: the guest
// who PROPOSED gets the token of the new game from a read of the old game (also after a reload on an
// already accepted rematch), the guest who ACCEPTED gets it in the answer. Screenshots go to
// $GOMOKU_SHOTS_DIR in the theme $GOMOKU_SHOTS_THEME (default light) at 360, 320 and 1280 px.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const first = new Browser(`${inject("browserSession")}-rematch-a`);
const second = new Browser(`${inject("browserSession")}-rematch-b`);
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
const pairOf = (response: Response, name: string) =>
  (response.headers.getSetCookie?.() ?? []).find((line) => line.startsWith(`${name}=`))!.split(";")[0]!;

async function giveCookie(browser: Browser, pair: string) {
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
}

async function signUp() {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `rematchpage-${n}@example.com`,
    displayName: `Rw_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return pairOf(response, "gomoku_session");
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const bodyLacks = (browser: Browser, text: string) =>
  browser.waitForFn(`!document.body.innerText.includes(${JSON.stringify(text)})`);
const textOf = (browser: Browser, selector: string) => browser.text(selector);
/** Scrolls the control to the middle of the screen first: the rematch block sits below the board, and a click on a control cut by the edge misses. */
async function tap(browser: Browser, selector: string) {
  await browser.evaluate(`(() => { document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center" }); return true; })()`);
  await browser.click(selector);
}
const overflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
async function shot(browser: Browser, name: string, widths = [360]) {
  if (!shotsDir) return;
  for (const width of widths) {
    await browser.setViewport(width, 900);
    await browser.run("screenshot", "--full", `${shotsDir}/${name}-${width}-${shotsTheme}.png`);
  }
  await browser.setViewport(360, 900);
}
const ALL = [360, 320, 1280];

type Seat = { browser: Browser; cookie: string };
type Pair = { gameId: string; a: Seat; b: Seat };

/** `a` creates (account or guest), `b` joins (account or guest); both open the page, then `a` resigns: a finished game on both screens. */
async function finishedGame(kinds: { a: "account" | "guest"; b: "account" | "guest" }): Promise<Pair> {
  const aCookie =
    kinds.a === "account" ? await signUp() : null;
  const created =
    kinds.a === "account"
      ? await api("POST", "/api/games", {}, aCookie!)
      : await api("POST", "/api/games", { acknowledgedGuestWarning: true, nickname: "Ola" });
  expect(created.status).toBe(201);
  const { gameId, invitation } = ((await created.json()) as { data: { gameId: string; invitation: { code: string } } }).data;
  const a: Seat = { browser: first, cookie: aCookie ?? pairOf(created, "gomoku_guest") };
  let bCookie: string;
  if (kinds.b === "guest") {
    const joined = await api("POST", `/api/invitations/${invitation.code}/accept`, { as: "guest", acknowledgedGuestWarning: true, nickname: "Zuza" });
    expect(joined.status).toBe(200);
    bCookie = pairOf(joined, "gomoku_guest");
  } else {
    bCookie = await signUp();
    expect((await api("POST", `/api/invitations/${invitation.code}/accept`, { as: "user" }, bCookie)).status).toBe(200);
  }
  const b: Seat = { browser: second, cookie: bCookie };
  for (const seat of [a, b]) {
    await giveCookie(seat.browser, seat.cookie);
    await seat.browser.setViewport(360, 900);
    await seat.browser.open(`${baseUrl}/games/${gameId}`);
  }
  for (const seat of [a, b]) await bodyHas(seat.browser, "Partia w toku");
  // `a` resigns through the API: both pages find the result by polling.
  expect((await api("POST", `/api/games/${gameId}/resign`, undefined, a.cookie)).status).toBe(200);
  for (const seat of [a, b]) await bodyHas(seat.browser, "Koniec partii");
  return { gameId, a, b };
}

const rematchRow = async (gameId: string) =>
  (await run(`select rematch_state, rematch_offered_by_seat, rematch_game_id from games where id = ?`, [gameId]))[0]!;
const urlGame = async (browser: Browser) => (await browser.url()).split("/games/")[1]!;
const myColor = (browser: Browser) => textOf(browser, "[data-testid=my-color]");

describe("rematch between two accounts", () => {
  it("offers, waits with a countdown, is found by the opponent without a reload and accepted: both play in the new game, colours swapped (p06.10-p06.12)", async () => {
    const { gameId, a, b } = await finishedGame({ a: "account", b: "account" });
    const colorBefore = { a: await myColor(a.browser), b: await myColor(b.browser) };
    await shot(a.browser, "p06-10-rewanz-propozycja", ALL);

    expect(await textOf(a.browser, "[data-testid=rematch-info]")).toMatch(/Rewanż to nowa partia z odwróconymi kolorami: zagrasz (czarnymi|białymi)\./);
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(a.browser, "Zaproponowano rewanż. Czekamy na odpowiedź przeciwnika (do 5 min).");
    const countdown = await textOf(a.browser, "[data-testid=rematch-countdown]");
    expect(countdown).toMatch(/Pozostało [45]:\d\d\./);
    expect(await rematchRow(gameId)).toMatchObject({ rematch_state: "pending" });
    await shot(a.browser, "p06-11-rewanz-zaproponowany", ALL);
    expect(await overflow(a.browser)).toBe(false);

    // The opponent finds the offer by polling (<= 3 s), without a reload.
    await bodyHas(b.browser, "proponuje rewanż. Kolory zostaną zamienione.");
    await shot(b.browser, "p06-12-rewanz-oferta", ALL);
    expect(await overflow(b.browser)).toBe(false);

    await tap(b.browser, "[data-testid=rematch-accept]");
    await b.browser.waitForFn("location.pathname !== '/games/" + gameId + "'");
    // The proposer follows by polling.
    await a.browser.waitForFn("location.pathname !== '/games/" + gameId + "'");
    const newId = await urlGame(b.browser);
    expect(await urlGame(a.browser)).toBe(newId);
    expect(await rematchRow(gameId)).toMatchObject({ rematch_state: "accepted", rematch_game_id: newId });
    for (const seat of [a, b]) await bodyHas(seat.browser, "Partia w toku");
    // Swapped colours; the new game says so in words.
    const colorAfter = { a: await myColor(a.browser), b: await myColor(b.browser) };
    expect(colorAfter.a).not.toBe(colorBefore.a.replace("Grałeś", "Grasz"));
    expect(colorAfter.b).not.toBe(colorBefore.b.replace("Grałeś", "Grasz"));
    expect(await a.browser.text("main")).toContain("Rewanż: kolory zostały zamienione.");
    expect(await b.browser.text("main")).toContain("Rewanż: kolory zostały zamienione.");
    await shot(a.browser, "p05-rewanz-nowa-partia", [360]);
  });

  it("shows the refusal to the proposer, who can offer again; the refuser sees 'Odrzuciłeś' (p06.13)", async () => {
    const { gameId, a, b } = await finishedGame({ a: "account", b: "account" });
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(b.browser, "proponuje rewanż");
    await tap(b.browser, "[data-testid=rematch-decline]");
    await bodyHas(b.browser, "Odrzuciłeś propozycję rewanżu.");
    await bodyHas(a.browser, "Zaproszenie do rewanżu odrzucone");
    await shot(a.browser, "p06-13-rewanz-odrzucony", ALL);
    expect(await rematchRow(gameId)).toMatchObject({ rematch_state: "declined" });

    // Offering again is possible; the opponent sees the new offer.
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(a.browser, "Zaproponowano rewanż");
    await bodyHas(b.browser, "proponuje rewanż. Kolory zostaną zamienione.");
  });

  it("withdraws the offer: the proposer is back at the start, the opponent loses the offer by polling", async () => {
    const { a, b } = await finishedGame({ a: "account", b: "account" });
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(b.browser, "proponuje rewanż");
    await tap(a.browser, "[data-testid=rematch-withdraw]");
    await bodyHas(a.browser, "Rewanż to nowa partia z odwróconymi kolorami");
    expect(await a.browser.count("[data-testid=rematch-offer]")).toBe(1);
    // For the opponent it is a declined offer of the other side: nothing to answer, the offer button is back.
    await bodyHas(b.browser, "Rewanż to nowa partia z odwróconymi kolorami");
    expect(await b.browser.count("[data-testid=rematch-accept]")).toBe(0);
  });

  it("leaving for the main page declines the open offer, so the proposer sees it at once (L21)", async () => {
    const { gameId, a, b } = await finishedGame({ a: "account", b: "account" });
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(b.browser, "proponuje rewanż");
    await tap(b.browser, "[data-testid=rematch-leave]");
    await b.browser.waitForFn("location.pathname === '/'");
    await bodyHas(a.browser, "Zaproszenie do rewanżu odrzucone");
    expect(await rematchRow(gameId)).toMatchObject({ rematch_state: "declined" });
  });

  it("shows the expiry on both screens when the time of the offer runs out, and offers again (p06.14)", async () => {
    const { gameId, a, b } = await finishedGame({ a: "account", b: "account" });
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(b.browser, "proponuje rewanż");
    // No five minutes of waiting: the end of the offer is moved to the past.
    await run(`update games set rematch_expires_at = now() - interval '1 second' where id = ?`, [gameId]);
    for (const seat of [a, b]) await bodyHas(seat.browser, "Zaproszenie do rewanżu wygasło (po 5 minutach).");
    await shot(a.browser, "p06-14-rewanz-wygasl", ALL);
    expect(await b.browser.count("[data-testid=rematch-accept]")).toBe(0);
    await tap(b.browser, "[data-testid=rematch-offer]");
    await bodyHas(b.browser, "Zaproponowano rewanż");
    await bodyHas(a.browser, "proponuje rewanż. Kolory zostaną zamienione.");
  });

  it("counts the offer against the server's time: a device clock 6 minutes fast or slow changes neither the wait nor the acceptance (M1)", async () => {
    const { gameId, a, b } = await finishedGame({ a: "account", b: "account" });
    const skew = (minutes: number) => `(() => {
      const RealDate = Date; const shift = ${minutes} * 60 * 1000;
      window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [RealDate.now() + shift])); } static now() { return RealDate.now() + shift; } };
      return true;
    })()`;
    // The proposer's clock runs 6 minutes ahead, the opponent's 6 minutes behind: against the device clocks
    // the offer would be over for the first and not yet made for the second.
    await a.browser.evaluate(skew(6));
    await b.browser.evaluate(skew(-6));
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(a.browser, "Zaproponowano rewanż");
    await bodyHas(b.browser, "proponuje rewanż");
    await a.browser.waitForFn(`/Pozostało [45]:\\d\\d/.test(document.body.innerText)`);
    expect(await a.browser.count("[data-testid=rematch-offer]")).toBe(0);
    const left = await b.browser.evaluate<string>("document.querySelector('[data-testid=rematch-countdown]').textContent");
    expect(left).toMatch(/Pozostało [45]:\d\d/);
    expect(await b.browser.count("[data-testid=rematch-accept]")).toBe(1);
    expect(await rematchRow(gameId)).toMatchObject({ rematch_state: "pending" });
    await tap(b.browser, "[data-testid=rematch-accept]");
    await a.browser.waitForFn(`location.pathname !== '/games/${gameId}'`);
  });

  it("answers 409 ACTIVE_GAME_EXISTS with a link to the player's own game and keeps the offer (L22)", async () => {
    const { gameId, a, b } = await finishedGame({ a: "account", b: "account" });
    // `b` starts another game with a third player.
    const carol = await signUp();
    const other = await api("POST", "/api/games", {}, b.cookie);
    expect(other.status).toBe(201);
    const { gameId: otherId, invitation } = ((await other.json()) as { data: { gameId: string; invitation: { code: string } } }).data;
    expect((await api("POST", `/api/invitations/${invitation.code}/accept`, { as: "user" }, carol)).status).toBe(200);

    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(b.browser, "proponuje rewanż");
    await tap(b.browser, "[data-testid=rematch-accept]");
    await bodyHas(b.browser, "Masz już partię w toku.");
    expect(await b.browser.evaluate<string>("document.querySelector('[data-testid=rematch-own-game]').getAttribute('href')")).toBe(`/games/${otherId}`);
    await shot(b.browser, "p06-12-rewanz-masz-partie", ALL);
    expect(await rematchRow(gameId)).toMatchObject({ rematch_state: "pending" });
    // The offer stays answerable: the link takes the player to the other game.
    await tap(b.browser, "[data-testid=rematch-own-game]");
    await b.browser.waitForFn(`location.pathname === '/games/${otherId}'`);
  });
});

describe("rematch with a guest (L24, p06.15)", () => {
  it("account proposes, the guest accepts: the answer sets the guest's new token and both land in the new game", async () => {
    const { gameId, a, b } = await finishedGame({ a: "account", b: "guest" });
    await bodyHas(b.browser, "Jako gość dostaniesz nowy dostęp do nowej partii w tej przeglądarce.");
    await shot(b.browser, "p06-10-rewanz-gosc", ALL);
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(b.browser, "proponuje rewanż");
    await shot(b.browser, "p06-15-rewanz-gosc-oferta", [360]);
    const oldToken = (await b.browser.cookies()).find((cookie) => cookie.name === "gomoku_guest")!.value;
    await tap(b.browser, "[data-testid=rematch-accept]");
    await b.browser.waitForFn(`location.pathname !== '/games/${gameId}'`);
    const newId = await urlGame(b.browser);
    await bodyHas(b.browser, "Partia w toku");
    await bodyHas(b.browser, "Nowa partia ma nowy dostęp w tej przeglądarce");
    await shot(b.browser, "p06-15-rewanz-gosc-nowa-partia", ALL);
    expect((await b.browser.cookies()).find((cookie) => cookie.name === "gomoku_guest")!.value).not.toBe(oldToken);
    await a.browser.waitForFn(`location.pathname === '/games/${newId}'`);
    await bodyHas(a.browser, "Partia w toku");
    expect(await b.browser.count("[data-testid=token-notice-dismiss]")).toBe(1);
    await tap(b.browser, "[data-testid=token-notice-dismiss]");
    await bodyLacks(b.browser, "Nowa partia ma nowy dostęp w tej przeglądarce");
  });

  it("guest proposes, the account accepts: the guest's poll claims the token and the new game is NOT a 404", async () => {
    const { gameId, a, b } = await finishedGame({ a: "guest", b: "account" });
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(a.browser, "Zaproponowano rewanż");
    await bodyHas(b.browser, "Ola (gość) proponuje rewanż");
    await tap(b.browser, "[data-testid=rematch-accept]");
    await b.browser.waitForFn(`location.pathname !== '/games/${gameId}'`);
    const newId = await urlGame(b.browser);
    await a.browser.waitForFn(`location.pathname === '/games/${newId}'`);
    await bodyHas(a.browser, "Partia w toku");
    expect(await a.browser.text("main")).not.toContain("Nie znaleziono");
    const [seat] = await run(`select guest_token_hash from game_players where game_id = ? and kind = 'guest'`, [newId]);
    expect(seat!.guest_token_hash).not.toBeNull();
    // The new game accepts the guest's moves: the token works.
    expect((await api("GET", `/api/games/${newId}`, undefined, (await a.browser.cookies()).map((c) => `${c.name}=${c.value}`).join("; "))).status).toBe(200);
  });

  it("guest proposes and the page is reloaded after the account accepted: one read of the old game fetches the token, then the new game opens (reload on 'accepted')", async () => {
    const { gameId, a, b } = await finishedGame({ a: "guest", b: "account" });
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(a.browser, "Zaproponowano rewanż");
    // The proposer's page is gone while the account accepts through the API.
    await a.browser.open("about:blank");
    const accepted = await api("POST", `/api/games/${gameId}/rematch/accept`, undefined, b.cookie);
    expect(accepted.status).toBe(200);
    const newId = ((await accepted.json()) as { data: { gameId: string } }).data.gameId;
    // Server-rendered 'accepted': the cookie can only come from the read the page makes itself.
    await a.browser.open(`${baseUrl}/games/${gameId}`);
    await a.browser.waitForFn(`location.pathname === '/games/${newId}'`);
    await bodyHas(a.browser, "Partia w toku");
    expect(await a.browser.text("main")).not.toContain("Nie znaleziono");
    const [seat] = await run(`select guest_token_hash from game_players where game_id = ? and kind = 'guest'`, [newId]);
    expect(seat!.guest_token_hash).not.toBeNull();
  });

  it("guest against guest: the proposer and the acceptor both land in the new game", async () => {
    const { gameId, a, b } = await finishedGame({ a: "guest", b: "guest" });
    await tap(a.browser, "[data-testid=rematch-offer]");
    await bodyHas(b.browser, "Ola (gość) proponuje rewanż");
    await tap(b.browser, "[data-testid=rematch-accept]");
    await b.browser.waitForFn(`location.pathname !== '/games/${gameId}'`);
    const newId = await urlGame(b.browser);
    await a.browser.waitForFn(`location.pathname === '/games/${newId}'`);
    for (const seat of [a, b]) await bodyHas(seat.browser, "Partia w toku");
    for (const seat of [a, b]) expect(await seat.browser.text("main")).not.toContain("Nie znaleziono");
    const players = await run(`select guest_token_hash, nickname from game_players where game_id = ? order by seat`, [newId]);
    expect(players.map((row) => row.nickname)).toEqual(["Ola", "Zuza"]);
    expect(players.every((row) => row.guest_token_hash !== null)).toBe(true);
  });
});
