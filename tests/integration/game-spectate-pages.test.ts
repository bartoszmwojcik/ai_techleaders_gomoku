// Spectating a public game in a real browser (E10-S02, #207): the invite page of a game in progress
// offers "Oglądaj partię"; a visitor with a nickname and an account land on the read-only game page
// (board, both clocks, whose turn it is), see a move of the players within polling time and the
// result at the end, with no control of a player; the 21st spectator sees "Partia ma komplet
// widzów"; nothing overflows at 320 px. Screenshots go to $GOMOKU_SHOTS_DIR when the directory is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(`${inject("browserSession")}-spectate`);
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const shotsTheme = process.env.GOMOKU_SHOTS_THEME === "dark" ? "dark" : "light";

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  await browser.clearCookies();
});
afterAll(async () => {
  await orm.close();
  await browser.clearCookies();
  await browser.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.71.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
const call = (path: string, body: unknown, cookie?: string) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress(), ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0]!;

async function signedUp(): Promise<{ cookie: string; name: string }> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const name = `Sw_${n}`;
  const response = await call("/api/auth/register", { email: `spectpage-${n}@example.com`, displayName: name, password: "secret123" });
  expect(response.status).toBe(201);
  return { cookie: cookieOf(response), name };
}
async function startedGame() {
  const alice = await signedUp();
  const bob = await signedUp();
  const created = await call("/api/games", { isPublic: true }, alice.cookie);
  const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
  expect((await call(`/api/invitations/${data.invitation.code}/accept`, { as: "user" }, bob.cookie)).status).toBe(200);
  expect((await fetch(`${baseUrl}/api/games/${data.gameId}`, { headers: { cookie: alice.cookie } })).status).toBe(200);
  const [row] = await run(`select black_seat from games where id = ?`, [data.gameId]);
  const blackSeat = row!.black_seat as 1 | 2;
  return { gameId: data.gameId, code: data.invitation.code, black: blackSeat === 1 ? alice : bob, white: blackSeat === 1 ? bob : alice };
}
const move = (gameId: string, cookie: string, x: number, y: number, moveNumber: number) =>
  call(`/api/games/${gameId}/moves`, { x, y, moveNumber }, cookie);

const click = (text: string, exact = false) => browser.run("find", "text", text, "click", ...(exact ? ["--exact"] : []));
const bodyHas = (text: string) => browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const stones = () => browser.count("[role=gridcell] button[aria-label*='kamień']");
const overflows = () => browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const shot = async (name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}-${shotsTheme}.png`);
};
async function asVisitor() {
  await browser.clearCookies();
  await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
}

describe("the spectator pages", () => {
  it("offers a visitor to watch a game in progress, then shows the board live and the result, read-only", async () => {
    const game = await startedGame();
    await asVisitor();
    await browser.setViewport(320, 800);

    await browser.open(`${baseUrl}/invite/${game.code}`);
    await browser.waitFor("[data-testid=invite-watch-note]");
    await bodyHas("Partia publiczna: może ją oglądać każdy z kodem");
    await shot("widz-zaproszenie-320");
    expect(await overflows()).toBe(false);

    await browser.fill("#watch-nickname", "Zosia");
    await click("Oglądaj partię");
    await bodyHas("Oglądasz partię");
    expect(new URL(await browser.url()).pathname).toBe(`/games/${game.gameId}`);
    await bodyHas("Jesteś widzem");
    expect(await stones()).toBe(0);
    // Both clocks and whose turn it is are in view; nothing of a player's is.
    await bodyHas("Ruch czarnych");
    expect(await browser.evaluate<number>(`document.querySelectorAll("[data-slot=clock]").length`)).toBe(2);
    expect(await browser.count("textarea, [data-testid=resign], [data-testid=chat-switch]")).toBe(0);
    expect(await browser.evaluate<boolean>(`document.body.innerText.includes("Poddaj")`)).toBe(false);
    await shot("widz-plansza-320");
    expect(await overflows()).toBe(false);

    // The players move: the board of the spectator follows within the polling time.
    expect((await move(game.gameId, game.black.cookie, 7, 7, 1)).status).toBe(200);
    await browser.waitForFn(`document.querySelectorAll("[role=gridcell] button[aria-label*='kamień']").length === 1`);
    expect((await move(game.gameId, game.white.cookie, 8, 7, 2)).status).toBe(200);
    await browser.waitForFn(`document.querySelectorAll("[role=gridcell] button[aria-label*='kamień']").length === 2`);
    await bodyHas("Ruch czarnych");

    // Pressing an intersection changes nothing on the server.
    const before = (await run(`select move_count from games where id = ?`, [game.gameId]))[0]!.move_count;
    await browser.evaluate(`document.querySelector("[role=gridcell] button[aria-label*='puste']")?.click()`);
    expect((await run(`select move_count from games where id = ?`, [game.gameId]))[0]!.move_count).toBe(before);

    // The white player resigns: the result arrives with the next read and polling stops.
    expect((await call(`/api/games/${game.gameId}/resign`, {}, game.white.cookie)).status).toBe(200);
    await bodyHas("Koniec partii");
    await bodyHas("Wygrały czarne");
    await shot("widz-wynik-320");
    expect(await overflows()).toBe(false);
  });

  it("lets a spectator with a nickname chat, marked as a spectator, and shows the flag with the count to all", async () => {
    const game = await startedGame();
    await asVisitor();
    await browser.setViewport(1024, 900);
    await browser.open(`${baseUrl}/invite/${game.code}`);
    await browser.waitFor("[data-testid=invite-watch-note]");
    await browser.fill("#watch-nickname", "Zosia");
    await click("Oglądaj partię");
    await bodyHas("Oglądasz partię");

    // The flag with the number of those watching; no chat switch for a spectator.
    await browser.waitFor("[data-testid=public-flag]");
    await bodyHas("Partia publiczna · widzów: 1");
    expect(await browser.count("[data-testid=chat-switch]")).toBe(0);
    await browser.fill("input[name=message]", "Ładna partia");
    await browser.press("Enter");
    await browser.waitForFn(`document.querySelector("[role=log]")?.innerText.includes("Widz · Zosia")`);
    await shot("widz-czat-pulpit");

    // A player sees the same flag and the spectator's message.
    await browser.clearCookies();
    await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
    const cookie = game.black.cookie;
    await browser.setCookie(cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1), baseUrl);
    await browser.open(`${baseUrl}/games/${game.gameId}`);
    await bodyHas("Partia publiczna · widzów: 1");
    await browser.waitForFn(`document.querySelector("[role=log]")?.innerText.includes("Widz · Zosia")`);
    await shot("gracz-flaga-czat-pulpit");
  });

  it("lets an account watch with one button and no nickname field, under its name", async () => {
    const game = await startedGame();
    const viewer = await signedUp();
    await browser.clearCookies();
    await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
    const [name, value] = [viewer.cookie.slice(0, viewer.cookie.indexOf("=")), viewer.cookie.slice(viewer.cookie.indexOf("=") + 1)];
    await browser.setCookie(name, value, baseUrl);
    await browser.setViewport(1024, 800);

    await browser.open(`${baseUrl}/invite/${game.code}`);
    await browser.waitFor("[data-testid=invite-watch-note]");
    expect(await browser.count("#watch-nickname")).toBe(0);
    await click("Oglądaj partię");
    await bodyHas("Oglądasz partię");
    await shot("widz-konto-pulpit");
  });

  it("tells the 21st that the audience is full", async () => {
    const game = await startedGame();
    for (let index = 0; index < 20; index += 1) {
      await run(`insert into game_spectators (game_id, token_hash, expires_at) values (?, ?, now() + interval '1 hour')`, [
        game.gameId,
        String(index).padStart(2, "0").repeat(32),
      ]);
    }
    await asVisitor();
    await browser.setViewport(320, 800);

    await browser.open(`${baseUrl}/invite/${game.code}`);
    await browser.waitFor("[data-testid=invite-watch-note]");
    await click("Oglądaj partię");
    await bodyHas("Partia ma komplet widzów");
    expect(new URL(await browser.url()).pathname).toBe(`/invite/${game.code}`);
    await shot("widz-komplet-320");
    expect(await overflows()).toBe(false);
  });

  it("shows a private game's code as invalid and a stranger the 404 of the game page", async () => {
    const owner = await signedUp();
    const created = await call("/api/games", {}, owner.cookie);
    const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
    const guest = await call(`/api/invitations/${data.invitation.code}/accept`, { as: "guest", acknowledgedGuestWarning: true });
    expect(guest.status).toBe(200);
    await asVisitor();

    await browser.open(`${baseUrl}/invite/${data.invitation.code}`);
    await bodyHas("To zaproszenie jest już nieważne");
    expect(await browser.count("[data-testid=invite-watch-note]")).toBe(0);

    const stranger = await fetch(`${baseUrl}/games/${data.gameId}`);
    expect(stranger.status).toBe(404);
  });
});
