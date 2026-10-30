// A guest's nickname in two real browsers (E02-S07, #94): the field on the invitation page, its
// refusal in the field's line, and the "{nick} (gość)" label the opponent sees on the board and
// after the result. The creator is an account; the guest joins from the invitation.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const creator = new Browser(`${inject("browserSession")}-nick-creator`);
const guest = new Browser(`${inject("browserSession")}-nick-guest`);

beforeAll(async () => {
  for (const browser of [creator, guest]) await browser.clearCookies();
});
afterAll(async () => {
  for (const browser of [creator, guest]) {
    await browser.setHeaders({});
    await browser.clearCookies();
    await browser.close();
  }
});

let counter = 0;
const nextAddress = () => `198.53.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

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

async function freshVisitors() {
  for (const browser of [creator, guest]) {
    await browser.setHeaders({ "x-forwarded-for": nextAddress() });
    await browser.clearCookies();
    await browser.setViewport(1280, 900);
  }
}

/** An account signed in in `creator`; returns its cookie header for API calls. */
async function signedUpCreator() {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await api("POST", "/api/auth/register", {
    email: `nick-${n}@example.com`,
    displayName: `Nick_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await creator.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  return pair;
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const click = (browser: Browser, text: string) => browser.run("find", "text", text, "click");
const horizontalOverflow = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const names = (browser: Browser) =>
  browser.evaluate<string[]>("[...document.querySelectorAll('[data-testid=player-name]')].map((node) => node.title)");

const labels = (browser: Browser) =>
  browser.evaluate<string[]>("[...document.querySelectorAll('[data-testid=player-name]')].map((node) => node.textContent)");

/** The creator opens a game; the guest opens its invitation and presses "Graj jako gość". */
async function openInvitationAsGuest() {
  await freshVisitors();
  const cookie = await signedUpCreator();
  await creator.open(`${baseUrl}/`);
  await creator.waitFor("[data-testid=create-game]");
  await creator.click("[data-testid=create-game]");
  await bodyHas(creator, "Czekamy na przeciwnika…");
  const gameId = new URL(await creator.url()).pathname.split("/").pop()!;
  const code = await creator.evaluate<string>("document.querySelectorAll('dd')[1].textContent");
  await guest.open(`${baseUrl}/invite/${code}`);
  await guest.waitFor("[data-testid=invite-page]");
  await click(guest, "Graj jako gość");
  await guest.waitFor("#invite-nickname");
  return { cookie, gameId };
}

async function joinAndWait() {
  await click(guest, "Rozumiem, graj jako gość");
  await guest.waitForFn("location.pathname.startsWith('/games/')");
  await bodyHas(creator, "Partia w toku");
  await bodyHas(guest, "Partia w toku");
}

describe("the nickname of a guest", () => {
  it("shows the nickname as '{nick} (gość)' to the opponent on the board and after the result", async () => {
    const { cookie, gameId } = await openInvitationAsGuest();
    await guest.fill("#invite-nickname", "  Piotr   K ");
    await joinAndWait();
    expect(await names(creator)).toEqual(["Piotr K (gość)"]);
    expect(await labels(creator)).toEqual(["Piotr K (gość)"]);
    // The guest sees themselves as "Ty: Piotr K (gość)".
    expect(await labels(guest)).toEqual(["Ty: Piotr K (gość)"]);

    // Finish the game through the API: black plays five in a row, white four.
    const guestCookie = (await guest.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    const state = (await (await api("GET", `/api/games/${gameId}`, undefined, cookie)).json()) as {
      data: { blackSeat: number };
    };
    const [blackCookie, whiteCookie] = state.data.blackSeat === 1 ? [cookie, guestCookie] : [guestCookie, cookie];
    const moves: [number, number][] = [[0, 7], [0, 9], [1, 7], [1, 9], [2, 7], [2, 9], [3, 7], [3, 9], [4, 7]];
    for (const [index, [x, y]] of moves.entries()) {
      const response = await api("POST", `/api/games/${gameId}/moves`, { x, y, moveNumber: index + 1 }, index % 2 === 0 ? blackCookie : whiteCookie);
      expect(response.status, `move ${index + 1}`).toBe(200);
    }
    await bodyHas(creator, "Koniec partii");
    expect(await names(creator)).toEqual(["Piotr K (gość)"]);
    expect(await labels(creator)).toEqual(["Piotr K (gość)"]);
  });

  it("calls a guest without a nickname 'Gracz 2 (gość)'", async () => {
    await openInvitationAsGuest();
    await joinAndWait();
    expect(await names(creator)).toEqual(["Gracz 2 (gość)"]);
    expect(await labels(guest)).toEqual(["Ty: Gracz 2 (gość)"]);
  });

  it("refuses an invalid nickname in the field's line and keeps the value", async () => {
    await openInvitationAsGuest();
    await guest.fill("#invite-nickname", "Ala<b>");
    await click(guest, "Rozumiem, graj jako gość");
    await bodyHas(guest, "Nick może zawierać litery, cyfry, spacje oraz znaki _ i -.");
    expect(new URL(await guest.url()).pathname).toMatch(/^\/invite\//);
    expect(await guest.evaluate<string>("document.getElementById('invite-nickname').value")).toBe("Ala<b>");
    expect(await guest.evaluate<string>("document.activeElement.id")).toBe("invite-nickname");
    expect(await guest.evaluate<string>("document.getElementById('invite-nickname').getAttribute('aria-describedby')")).toContain("invite-nickname-error");
  });

  it("keeps a long nickname on one line at 360 px, with '(gość)' visible and nothing scrolling sideways", async () => {
    await openInvitationAsGuest();
    const long = "W".repeat(24);
    await guest.fill("#invite-nickname", long);
    await joinAndWait();
    for (const browser of [creator, guest]) {
      await browser.setViewport(360, 800);
      expect(await horizontalOverflow(browser)).toBe(false);
    }
    expect(await names(creator)).toEqual([`${long} (gość)`]);
    const suffixVisible = await creator.evaluate<boolean>(
      "(() => { const suffix = [...document.querySelectorAll('[data-testid=player-name] span')].find((node) => node.textContent === ' (gość)'); const box = suffix.getBoundingClientRect(); return box.width > 0 && box.right <= document.documentElement.clientWidth; })()",
    );
    expect(suffixVisible).toBe(true);
    for (const browser of [creator, guest]) await browser.setViewport(1280, 800);
  });
});
