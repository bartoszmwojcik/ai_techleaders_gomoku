// The invitation pages in a real browser (E02 phase 2, #21 steps 7-8): create a game on the home
// page, read the code, join as a guest and as an account through /join and /invite, cancel,
// BR-13 and the 404 of a stranger. Two or three browser sessions play the different people.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const creator = new Browser(inject("browserSession"));
const guest = new Browser(`${inject("browserSession")}-guest`);
const stranger = new Browser(`${inject("browserSession")}-stranger`);

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  for (const browser of [creator, guest, stranger]) await browser.clearCookies();
});
afterAll(async () => {
  await orm.close();
  for (const browser of [creator, guest, stranger]) {
    await browser.setHeaders({});
    await browser.clearCookies();
  }
  await guest.close();
  await stranger.close();
});
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute(text, params);

let counter = 0;
const nextAddress = () => `198.51.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
/** Every person gets an own client address, so the pool of failed lookups of one never limits another. */
async function visitor(browser: Browser) {
  await browser.setHeaders({ "x-forwarded-for": nextAddress() });
  await browser.clearCookies();
}

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

/** A registered account; the browser (when given) carries its session cookie. */
async function signedUp(browser?: Browser) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `pages-${n}@example.com`,
    displayName: `Pages_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
  if (browser) await browser.setCookie(name, value, baseUrl);
  return { cookie: pair, displayName: `Pages_${n}` };
}

async function createdGame(cookie: string) {
  const response = await api("POST", "/api/games", undefined, cookie);
  expect(response.status).toBe(201);
  const { data } = (await response.json()) as { data: { gameId: string; invitation: { code: string } } };
  return { gameId: data.gameId, code: data.invitation.code };
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const click = (browser: Browser, text: string, exact = false) =>
  browser.run("find", "text", text, "click", ...(exact ? ["--exact"] : []));
const pathOf = async (browser: Browser) => new URL(await browser.url()).pathname;

describe("the invitation pages", () => {
  it("creates a game on the home page, shows the code and lets a guest and a second browser meet in it", async () => {
    await visitor(creator);
    const { displayName } = await signedUp(creator);
    await creator.open(`${baseUrl}/`);
    await creator.waitFor("[data-testid=create-game]");
    await creator.click("[data-testid=create-game]");
    await bodyHas(creator, "Czekamy na przeciwnika…");
    expect(await pathOf(creator)).toMatch(/^\/games\/[0-9a-f-]{36}$/);
    const text = await creator.text("main");
    expect(text).toContain("Partia czeka na przeciwnika");
    expect(text).toContain("Czekamy na przeciwnika…");
    const code = await creator.evaluate<string>("document.querySelectorAll('dd')[1].textContent");
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const link = await creator.evaluate<string>("document.querySelectorAll('dd')[0].textContent");
    expect(link).toBe(`${baseUrl}/invite/${code}`);

    // The guest types the code by hand, in small letters and without the dash.
    await visitor(guest);
    await guest.open(`${baseUrl}/join`);
    await guest.fill("#join-code", "abc");
    await guest.click("[data-testid=join-form] button[type=submit]");
    await bodyHas(guest, "Sprawdź kod: ma 8 znaków.");
    await guest.fill("#join-code", code.replace("-", "").toLowerCase());
    await guest.click("[data-testid=join-form] button[type=submit]");
    await guest.waitFor("[data-testid=invite-page]");
    expect(await pathOf(guest)).toBe(`/invite/${code}`);
    expect(await guest.text("main")).toContain(`${displayName} zaprasza Cię do partii Gomoku`);
    // Opening the link consumed nothing.
    const links = await guest.evaluate<string[]>("[...document.querySelectorAll('main a')].map((a) => a.getAttribute('href'))");
    expect(links).toContain(`/login?next=${encodeURIComponent(`/invite/${code}`)}`);
    expect(links).toContain(`/register?next=${encodeURIComponent(`/invite/${code}`)}`);

    await click(guest, "Graj jako gość");
    await bodyHas(guest, "Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii");
    expect(await guest.count("a[href^='/login']")).toBe(0);
    await click(guest, "Rozumiem, graj jako gość");
    await guest.waitForFn("location.pathname.startsWith('/games/')");
    await bodyHas(guest, "Partia w toku");
    expect(await guest.text("main")).toContain("Grasz bez konta");
    expect(await pathOf(guest)).toBe(await pathOf(creator));

    // The creator's page polls and moves on by itself: "Przeciwnik dołączył", then the board ("Partia w toku").
    await bodyHas(creator, "Partia w toku");
    expect(await creator.text("main")).toContain("Gość");

    // A third person: the link is spent, and the game is not theirs (404 with the same text).
    await visitor(stranger);
    await stranger.open(`${baseUrl}/invite/${code}`);
    await stranger.waitFor("[data-testid=invite-page]");
    expect(await stranger.text("main")).toContain("To zaproszenie jest już nieważne");
    const gamePath = await pathOf(creator);
    await stranger.open(`${baseUrl}${gamePath}`);
    expect(await stranger.text("main")).toContain("Ta partia nie istnieje albo nie masz do niej dostępu");
  });

  it("answers 404 for a game that is not the visitor's and for a malformed id, without saying which", async () => {
    const owner = await signedUp();
    const { gameId } = await createdGame(owner.cookie);
    const other = await fetch(`${baseUrl}/games/${gameId}`);
    const malformed = await fetch(`${baseUrl}/games/not-a-game`);
    expect(other.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(await other.text()).toContain("Ta partia nie istnieje albo nie masz do niej dostępu");
    // The creator's own page is fine.
    const own = await fetch(`${baseUrl}/games/${gameId}`, { headers: { cookie: owner.cookie } });
    expect(own.status).toBe(200);
  });

  it("keeps the code out of the Referer and out of search engines", async () => {
    const html = await (await fetch(`${baseUrl}/invite/ABCD-EFGH`)).text();
    expect(html).toContain('<meta name="referrer" content="no-referrer"/>');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
  });

  it("asks before cancelling, then leaves for the home page and voids the link", async () => {
    await visitor(creator);
    const owner = await signedUp(creator);
    const { gameId, code } = await createdGame(owner.cookie);
    await creator.open(`${baseUrl}/games/${gameId}`);
    await bodyHas(creator, "Czekamy na przeciwnika…");

    await click(creator, "Anuluj zaproszenie");
    await bodyHas(creator, "Anulować zaproszenie?");
    await click(creator, "Wróć", true);
    await creator.waitForFn("!document.body.innerText.includes('Anulować zaproszenie?')");
    expect(await pathOf(creator)).toBe(`/games/${gameId}`);

    await click(creator, "Anuluj zaproszenie");
    await click(creator, "Tak, anuluj zaproszenie");
    await creator.waitForFn("location.pathname === '/'");
    await bodyHas(creator, "Zaproszenie anulowane");
    expect(await creator.url()).toBe(`${baseUrl}/?notice=cancelled`);

    await visitor(stranger);
    await stranger.open(`${baseUrl}/invite/${code}`);
    await stranger.waitFor("[data-testid=invite-page]");
    expect(await stranger.text("main")).toContain("To zaproszenie jest już nieważne");
  });

  it("lets a signed-in player join with one button, and sends the creator and a participant to the game", async () => {
    const owner = await signedUp();
    const { gameId, code } = await createdGame(owner.cookie);
    await visitor(guest);
    const joiner = await signedUp(guest);
    await guest.open(`${baseUrl}/invite/${code}`);
    await guest.waitFor("[data-testid=invite-page]");
    expect(await guest.count("a[href^='/login']")).toBe(0);
    expect(await guest.text("main")).toContain("Dołącz do partii");
    await click(guest, "Dołącz do partii");
    await guest.waitForFn("location.pathname.startsWith('/games/')");
    expect(await pathOf(guest)).toBe(`/games/${gameId}`);
    // The creator made the game over the API and never opened its page (Q20): the joiner waits for them.
    await bodyHas(guest, `Czekamy, aż ${owner.displayName} otworzy partię`);
    expect(await guest.text("main")).not.toContain("Grasz bez konta");
    // The creator opens the page: the joiner's polling moves on to the board ("Partia w toku").
    expect((await fetch(`${baseUrl}/games/${gameId}`, { headers: { cookie: owner.cookie } })).status).toBe(200);
    await bodyHas(guest, "Partia w toku");

    // Both go straight to the game from the link (s07.4, s07.5).
    await guest.open(`${baseUrl}/invite/${code}`);
    expect(await pathOf(guest)).toBe(`/games/${gameId}`);
    const ownerLink = await fetch(`${baseUrl}/invite/${code}`, { headers: { cookie: owner.cookie }, redirect: "manual" });
    expect(ownerLink.status).toBe(307);
    expect(ownerLink.headers.get("location")).toBe(`/games/${gameId}`);
    expect(joiner.displayName).toBeTruthy();
  });

  it("offers a player with an own waiting game to swap it (BR-13, Q18) and tells one with a game in progress", async () => {
    const friend = await signedUp();
    const { code } = await createdGame(friend.cookie);
    await visitor(creator);
    const player = await signedUp(creator);
    const own = await createdGame(player.cookie);

    await creator.open(`${baseUrl}/invite/${code}`);
    await creator.waitFor("[data-testid=invite-page]");
    expect(await creator.text("main")).toContain("Masz oczekującą partię");
    await click(creator, "Anuluj moją partię i dołącz");
    await creator.waitForFn("location.pathname.startsWith('/games/')");
    expect(await pathOf(creator)).not.toBe(`/games/${own.gameId}`);
    const ownState = await api("GET", `/api/games/${own.gameId}`, undefined, player.cookie);
    expect(((await ownState.json()) as { data: { status: string } }).data.status).toBe("cancelled");

    // Now the player is in a game in progress: a third invitation says so (s07.6).
    const second = await signedUp();
    const other = await createdGame(second.cookie);
    await creator.open(`${baseUrl}/invite/${other.code}`);
    await creator.waitFor("[data-testid=invite-page]");
    expect(await creator.text("main")).toContain("Masz już partię");
    expect(await creator.count("a[href^='/games/']")).toBe(1);
  });

  it("does not claim an own waiting game that has already expired (Q16)", async () => {
    const friend = await signedUp();
    const { code } = await createdGame(friend.cookie);
    await visitor(creator);
    const player = await signedUp(creator);
    const own = await createdGame(player.cookie);
    await run("update invitations set expires_at = now() - interval '1 hour' where game_id = ?", [own.gameId]);

    await creator.open(`${baseUrl}/invite/${code}`);
    await creator.waitFor("[data-testid=invite-page]");
    expect(await creator.text("main")).toContain("Dołącz do partii");
    expect(await creator.text("main")).not.toContain("Masz oczekującą partię");
    // And its own page says the invitation ran out.
    await creator.open(`${baseUrl}/games/${own.gameId}`);
    await bodyHas(creator, "Zaproszenie wygasło");
  });

  it("does not show 'Masz partię' on the home page for an expired invitation, and frees the slot (Q16)", async () => {
    await visitor(creator);
    const player = await signedUp(creator);
    const own = await createdGame(player.cookie);
    await run("update invitations set expires_at = now() - interval '1 hour' where game_id = ?", [own.gameId]);

    await creator.open(`${baseUrl}/`);
    await creator.waitFor("[data-testid=create-game]");
    expect(await creator.text("main")).not.toContain("Masz partię");
    const [slot] = await run(
      "select count(*) filter (where is_active) as held from game_players where game_id = ?",
      [own.gameId],
    );
    expect(Number(slot!.held)).toBe(0);
    // The slot is really free: a new game can be created.
    await createdGame(player.cookie);
  });

  it("does not show 'Masz partię' on the home page for a game nobody opened within 15 minutes, and frees the slot (Q21)", async () => {
    await visitor(creator);
    const player = await signedUp(creator);
    const own = await createdGame(player.cookie);
    const friend = await signedUp();
    const joined = await api("POST", `/api/invitations/${own.code}/accept`, { as: "user" }, friend.cookie);
    expect(joined.status).toBe(200);
    await run("update games set started_at = now() - interval '16 minutes' where id = ?", [own.gameId]);

    await creator.open(`${baseUrl}/`);
    await creator.waitFor("[data-testid=create-game]");
    expect(await creator.text("main")).not.toContain("Masz partię");
    const [slot] = await run(
      "select count(*) filter (where is_active) as held from game_players where game_id = ?",
      [own.gameId],
    );
    expect(Number(slot!.held)).toBe(0);
    await createdGame(player.cookie);
  });

  it("tells a second 'create' to go to the game the player already waits in (L01)", async () => {
    await visitor(creator);
    const player = await signedUp(creator);
    const own = await createdGame(player.cookie);
    await creator.open(`${baseUrl}/`);
    await bodyHas(creator, "Czeka na przeciwnika.");
    await creator.click("[data-testid=create-game]");
    await creator.waitForFn("location.pathname.startsWith('/games/')");
    expect(await pathOf(creator)).toBe(`/games/${own.gameId}`);
    await bodyHas(creator, "Masz już oczekującą partię.");
  });

  it("stops answering a guesser after 20 failed lookups from one address (Q13)", async () => {
    const headers = { "x-forwarded-for": nextAddress() };
    let last = "";
    for (let i = 0; i < 21; i += 1) {
      last = await (await fetch(`${baseUrl}/invite/ZZZZ-ZZ${String(i).padStart(2, "2")}`, { headers })).text();
    }
    expect(last).toContain("Zbyt wiele prób — spróbuj za chwilę");
    // A valid code gets the same answer from that address, so the page is no oracle.
    const owner = await signedUp();
    const { code } = await createdGame(owner.cookie);
    const spent = await (await fetch(`${baseUrl}/invite/${code}`, { headers })).text();
    expect(spent).toContain("Zbyt wiele prób — spróbuj za chwilę");
    expect(spent).not.toContain("zaprasza Cię");
  });
});
