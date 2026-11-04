// The QR code of an invitation (E12) in a real browser: on the card of a waiting game and in a public game in
// progress, for players and spectators, read back from a screenshot in both themes like a phone's camera would.
// Where the link no longer leads anywhere (private game after joining, cancelled, expired, closed audience)
// there is no code, in the page or at its address. Screenshots go to $GOMOKU_SHOTS_DIR when the directory is set.
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createOrm, type Orm } from "@gomoku/db";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(`${inject("browserSession")}-qr`);
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const INVITE_ALT = "Kod QR z linkiem zaproszenia";
const WATCH_ALT = "Kod QR z linkiem do oglądania partii";

let orm: Orm;
let dir: string;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  dir = await mkdtemp(join(tmpdir(), "gomoku-qr-"));
});
afterAll(async () => {
  await orm.close();
  await rm(dir, { recursive: true, force: true });
  await browser.clearCookies();
  await browser.close();
});
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute(text, params);

let counter = 0;
const nextAddress = () => `198.72.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
const call = (path: string, body: unknown, cookie?: string) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress(), ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0]!;
const qrStatus = async (gameId: string, cookie?: string) =>
  (await fetch(`${baseUrl}/api/games/${gameId}/qr`, { headers: cookie ? { cookie } : {} })).status;

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await call("/api/auth/register", { email: `qr-${n}@example.com`, displayName: `Qr_${n}`, password: "secret123" });
  expect(response.status).toBe(201);
  return cookieOf(response);
}
async function created(cookie: string, isPublic = false) {
  const response = await call("/api/games", { isPublic }, cookie);
  const { data } = (await response.json()) as { data: { gameId: string; invitation: { code: string; url: string } } };
  return data;
}
async function asVisitor(theme: "dark" | "light", cookie?: string) {
  await browser.clearCookies();
  await browser.setCookie("gomoku_theme", theme, baseUrl);
  if (cookie) await browser.setCookie(cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1), baseUrl);
  await browser.setViewport(1024, 900);
}
const image = (alt: string) => `img[alt="${alt}"]`;
const loaded = (alt: string) => browser.waitForFn(`document.querySelector(${JSON.stringify(image(alt))})?.naturalWidth > 0`);
const gone = (alt: string) => browser.waitForFn(`!document.querySelector(${JSON.stringify(image(alt))})`);
const bodyHas = (text: string) => browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);

/** What a reader finds on the screen: a screenshot of the whole page around the code, as the camera sees it. */
async function scan(alt: string, name: string): Promise<string | undefined> {
  await browser.run("scrollintoview", image(alt));
  const path = shotsDir ? join(shotsDir, `${name}.png`) : join(dir, `${name}.png`);
  await browser.run("screenshot", path);
  const png = PNG.sync.read(await readFile(path));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

describe("the QR code of an invitation", () => {
  it.each(["dark", "light"] as const)("reads back as the link of the card, in the %s theme, and opens the join screen", async (theme) => {
    const alice = await signedUp();
    const game = await created(alice);
    await asVisitor(theme, alice);

    await browser.open(`${baseUrl}/games/${game.gameId}`);
    await loaded(INVITE_ALT);

    const link = await scan(INVITE_ALT, `qr-karta-${theme}`);
    expect(link).toBe(game.invitation.url);
    expect(await browser.evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(link)})`)).toBe(true);
    // The image comes from the app itself, never from an outside generator.
    const source = await browser.evaluate<string>(`document.querySelector(${JSON.stringify(image(INVITE_ALT))}).src`);
    expect(new URL(source).origin).toBe(baseUrl);

    await asVisitor(theme);
    await browser.open(link!);
    await browser.waitFor("[data-testid=invite-page]");
    await bodyHas(`Kod zaproszenia: ${game.invitation.code}`);
    expect(new URL(await browser.url()).pathname).toBe(new URL(link!).pathname);
  });

  it("fits the card at 320 px", async () => {
    const alice = await signedUp();
    const game = await created(alice);
    await asVisitor("dark", alice);
    await browser.setViewport(320, 800);

    await browser.open(`${baseUrl}/games/${game.gameId}`);
    await loaded(INVITE_ALT);

    expect(await browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth")).toBe(false);
    expect(await scan(INVITE_ALT, "qr-karta-320")).toBe(game.invitation.url);
  });

  it("is there for a guest creator too, and only for the creator", async () => {
    const guest = await call("/api/games", { acknowledgedGuestWarning: true });
    expect(guest.status).toBe(201);
    const { data } = (await guest.json()) as { data: { gameId: string } };

    expect(await qrStatus(data.gameId, cookieOf(guest))).toBe(200);
    expect(await qrStatus(data.gameId, await signedUp())).toBe(404);
    expect(await qrStatus(data.gameId)).toBe(404);
  });

  it("is gone once the opponent joined a private game", async () => {
    const alice = await signedUp();
    const bob = await signedUp();
    const game = await created(alice);
    await asVisitor("dark", alice);
    await browser.open(`${baseUrl}/games/${game.gameId}`);
    await loaded(INVITE_ALT);

    expect((await call(`/api/invitations/${game.invitation.code}/accept`, { as: "user" }, bob)).status).toBe(200);

    await gone(INVITE_ALT);
    expect(await browser.count(image(WATCH_ALT))).toBe(0);
    expect(await qrStatus(game.gameId, alice)).toBe(404);
    expect(await qrStatus(game.gameId, bob)).toBe(404);
  });

  it("is gone when the invitation is cancelled or expired", async () => {
    const alice = await signedUp();
    const cancelled = await created(alice);
    expect((await call(`/api/games/${cancelled.gameId}/cancel`, {}, alice)).status).toBeLessThan(300);
    expect(await qrStatus(cancelled.gameId, alice)).toBe(404);

    const carol = await signedUp();
    const expired = await created(carol);
    await run(`update invitations set expires_at = now() - interval '1 minute' where game_id = ?`, [expired.gameId]);
    expect(await qrStatus(expired.gameId, carol)).toBe(404);
    await asVisitor("dark", carol);
    await browser.open(`${baseUrl}/games/${expired.gameId}`);
    await bodyHas("Zaproszenie wygasło");
    expect(await browser.count(image(INVITE_ALT))).toBe(0);
  });
});

describe("the QR code of a public game", () => {
  async function publicGame() {
    const alice = await signedUp();
    const bob = await signedUp();
    const game = await created(alice, true);
    expect((await call(`/api/invitations/${game.invitation.code}/accept`, { as: "user" }, bob)).status).toBe(200);
    // Both players have opened the page, so the game is under way.
    await fetch(`${baseUrl}/api/games/${game.gameId}`, { headers: { cookie: alice } });
    await fetch(`${baseUrl}/api/games/${game.gameId}`, { headers: { cookie: bob } });
    return { ...game, alice, bob };
  }

  it("shows players and spectators the link that opens watching, until the creator closes the audience", async () => {
    const game = await publicGame();
    await asVisitor("dark", game.bob);
    await browser.open(`${baseUrl}/games/${game.gameId}`);
    await loaded(WATCH_ALT);
    const link = await scan(WATCH_ALT, "qr-gracz-ciemny");
    expect(link).toBe(game.invitation.url);

    // The scan, as a stranger: the invitation page offers watching, and a spectator has the code as well.
    await asVisitor("light");
    await browser.open(link!);
    await browser.waitFor("[data-testid=invite-watch-note]");
    await browser.run("find", "text", "Oglądaj partię", "click");
    await bodyHas("Oglądasz partię");
    await loaded(WATCH_ALT);
    expect(await scan(WATCH_ALT, "qr-widz-jasny")).toBe(game.invitation.url);
    const spectator = (await browser.cookies()).find(({ name }) => name.includes("spectator"))!;
    const spectatorCookie = `${spectator.name}=${spectator.value}`;
    expect(await qrStatus(game.gameId, spectatorCookie)).toBe(200);

    // The creator closes the audience: the code is gone for everybody.
    expect((await call(`/api/games/${game.gameId}/audience/close`, {}, game.alice)).status).toBe(200);
    await browser.waitFor("[data-testid=audience-closed]");
    expect(await browser.count(image(WATCH_ALT))).toBe(0);
    expect(await qrStatus(game.gameId, spectatorCookie)).toBe(404);
    expect(await qrStatus(game.gameId, game.bob)).toBe(404);
    await asVisitor("dark", game.bob);
    await browser.open(`${baseUrl}/games/${game.gameId}`);
    await bodyHas("Partia w toku");
    expect(await browser.count(image(WATCH_ALT))).toBe(0);
  });

  it("leads to the notice of a full audience when 20 are watching", async () => {
    const game = await publicGame();
    for (let index = 0; index < 20; index += 1) {
      await run(`insert into game_spectators (game_id, token_hash, expires_at) values (?, ?, now() + interval '1 hour')`, [
        game.gameId,
        randomBytes(32).toString("hex"), // the hashes are unique across all the games of the shared database
      ]);
    }
    await asVisitor("dark", game.alice);
    await browser.open(`${baseUrl}/games/${game.gameId}`);
    await loaded(WATCH_ALT);
    const link = await scan(WATCH_ALT, "qr-komplet");

    await asVisitor("dark");
    await browser.open(link!);
    await browser.waitFor("[data-testid=invite-watch-note]");
    await browser.run("find", "text", "Oglądaj partię", "click");
    await bodyHas("Partia ma komplet widzów");
  });
});
