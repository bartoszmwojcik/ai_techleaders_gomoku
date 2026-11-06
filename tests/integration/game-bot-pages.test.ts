// A game against the bot in a real browser (hosted-bot spec, E13-S02 step 5), with BOT_ENABLED on
// (global-setup): "Przeciwnik" and "Poziom bota" on the home page and on /play, "Zagraj z botem", the board at
// once, the player's move and the bot's answer without a reload, resigning, and "Zagraj ponownie z botem"
// instead of a rematch, then the game in the history and its review (E13-S05); also at 320 px. Screenshots go to $GOMOKU_SHOTS_DIR in the theme $GOMOKU_SHOTS_THEME
// (default light) when the directory is set.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const browser = new Browser(`${inject("browserSession")}-bot`);
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const shotsTheme = process.env.GOMOKU_SHOTS_THEME === "dark" ? "dark" : "light";

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  await browser.clearCookies();
});
afterAll(async () => {
  await orm.close();
  await browser.setHeaders({});
  await browser.clearCookies();
  await browser.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.57.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

async function signedUp() {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
    body: JSON.stringify({ email: `botpage-${n}@example.com`, displayName: `Botp_${n}`, password: "secret123" }),
  });
  expect(response.status).toBe(201);
  const pair = (response.headers.get("set-cookie") ?? "").split(";")[0]!;
  await browser.clearCookies();
  await browser.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);
  await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
}

const bodyHas = (text: string) => browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const shot = async (name: string) => {
  if (shotsDir) await browser.run("screenshot", `${shotsDir}/${name}-${shotsTheme}.png`);
};
const horizontalOverflow = () =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth > document.documentElement.clientWidth");
const gameIdOf = async () => (await browser.url()).split("/games/")[1]!.split(/[?#]/)[0]!;
const moveCount = async (gameId: string) => (await run(`select move_count from games where id = ?`, [gameId]))[0]!.move_count as number;

/** The player's turn: the bot may have black and move first. */
const myTurn = () => bodyHas("Twój ruch");

/** Clicks the first free intersection nearest the centre (a mouse places the stone at once). */
async function playFreeCell() {
  const label = await browser.evaluate<string>(`(() => {
    const free = [...document.querySelectorAll('[role=grid] [aria-label$=", puste"]')].map((e) => e.getAttribute("aria-label"));
    const centre = free.find((l) => l === "Kolumna H, rząd 8, puste");
    return centre ?? free[0];
  })()`);
  await browser.click(`[aria-label="${label}"]`);
}

describe("playing the bot in the browser", () => {
  it("picks the bot on the home page, plays a move, sees the bot's answer, resigns and plays again", async () => {
    await signedUp();
    await browser.setViewport(1280, 900);
    await browser.open(`${baseUrl}/`);
    await browser.waitFor("[data-testid=settings-opponent]");
    await browser.click("[data-testid=settings-opponent-bot]");
    await browser.waitFor("[data-testid=settings-bot-level]");
    expect(await browser.count("[data-testid=create-game-public]")).toBe(0);
    await browser.click("[data-testid=settings-bot-level-2]");
    expect(await browser.text("[data-testid=create-game]")).toBe("Zagraj z botem");
    await shot("bot-home-picker");

    await browser.click("[data-testid=create-game]");
    // The game is in progress at once: no invitation, the board straight away.
    await bodyHas("Partia w toku");
    expect(await browser.evaluate<boolean>(`document.body.innerText.includes("Zaproś znajomego")`)).toBe(false);
    await bodyHas("Bot · poziom 2 · 16 MB");
    const gameId = await gameIdOf();

    await myTurn();
    const before = await moveCount(gameId);
    await playFreeCell();
    // The bot answers without a reload: the page reads every 750 ms while it thinks.
    await browser.waitForFn(`document.querySelectorAll('[role=grid] [aria-label$=" kamień"]').length === ${before + 2}`);
    await myTurn();
    expect(await moveCount(gameId)).toBe(before + 2);
    // No chat in a game with the bot (R14).
    expect(await browser.count("[data-testid=chat-panel]")).toBe(0);
    await shot("bot-game-1280");

    await browser.click("[data-testid=resign]");
    await browser.waitFor("[role=alertdialog]");
    await browser.click("[role=alertdialog] button:last-child");
    await bodyHas("Koniec partii");
    await browser.waitFor("[data-testid=bot-replay]");
    expect(await browser.count("[data-testid=rematch-box]")).toBe(0);
    await shot("bot-game-end");

    await browser.click("[data-testid=bot-replay-button]");
    await browser.waitForFn(`location.pathname !== ${JSON.stringify(`/games/${gameId}`)} && document.body.innerText.includes("Partia w toku")`);
    const next = await gameIdOf();
    expect(next).not.toBe(gameId);
    const [bot] = await run(`select bot_level from game_players where game_id = ? and kind = 'bot'`, [next]);
    expect(bot!.bot_level).toBe(2);
    await browser.click("[data-testid=resign]");
    await browser.waitFor("[role=alertdialog]");
    await browser.click("[role=alertdialog] button:last-child");
    await bodyHas("Koniec partii");

    // E13-S05: both games are in the account's history, the bot named by its strength, and the first one
    // can be reviewed move by move (BR-44).
    await browser.open(`${baseUrl}/history`);
    await browser.waitFor("[data-testid=history-review]");
    const opponents = await browser.evaluate<string[]>(
      `[...document.querySelectorAll('ul[aria-label="Zakończone partie"] > li')].map((row) => row.textContent)`,
    );
    expect(opponents).toHaveLength(2);
    for (const row of opponents) {
      expect(row).toContain("Bot · poziom 2 · 16 MB");
      expect(row).toContain("Poddanie");
    }
    await shot("bot-history");
    await browser.click(`a[href="/games/${gameId}/review"]`);
    await browser.waitFor("[data-testid=review-step]");
    expect(await browser.evaluate<string>(`document.querySelector("[data-testid=review-players]").textContent`)).toContain(
      "Bot · poziom 2 · 16 MB",
    );
    const total = await moveCount(gameId);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(await browser.text("[data-testid=review-step]")).toMatch(new RegExp(`^Ruch ${total} z ${total}`));
    await browser.click("[data-testid=review-start]");
    await browser.waitForFn(`document.querySelector("[data-testid=review-step]").textContent.startsWith("Początek")`);
    await browser.click("[data-testid=review-next]");
    await browser.waitForFn(`document.querySelector("[data-testid=review-step]").textContent.startsWith("Ruch 1 z ${total}")`);
    await shot("bot-review");
  });

  it("lets a guest play the bot from /play and fits 320 px", async () => {
    await browser.clearCookies();
    await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
    await browser.setHeaders({ "x-forwarded-for": nextAddress() });
    await browser.setViewport(320, 700);
    await browser.open(`${baseUrl}/play`);
    await browser.waitFor("[data-testid=settings-opponent]");
    await browser.click("[data-testid=settings-opponent-bot]");
    await bodyHas("Partia z botem nie zostanie zapisana w historii.");
    expect(await horizontalOverflow()).toBe(false);
    await shot("bot-play-320");

    await browser.click("[data-testid=guest-create]");
    await bodyHas("Partia w toku");
    await myTurn();
    expect(await horizontalOverflow()).toBe(false);
    await shot("bot-game-320");
    await browser.click("[data-testid=resign]");
    await browser.waitFor("[role=alertdialog]");
    await browser.click("[role=alertdialog] button:last-child");
    await browser.waitFor("[data-testid=bot-replay]");
    expect(await horizontalOverflow()).toBe(false);
    await shot("bot-game-end-320");
    await browser.setHeaders({});
  });
});
