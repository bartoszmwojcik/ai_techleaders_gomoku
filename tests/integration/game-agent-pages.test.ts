// The human's screens when the opponent is an agent that joined over MCP (E06-S01, BR-31), in a
// real browser: a guest creates a game, an MCP client joins (with and without a declared model
// name), the creator sees "Agent dołączył do partii" and "Agent · {name} (deklarowane)" at the
// clock and never a nickname, the name stays plain text at 320 px, no rematch after the game and
// the account creator finds the agent in /history.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const LONG = 120_000;

const baseUrl = inject("baseUrl");
const creator = new Browser(inject("browserSession"));

// Screenshots for the review (GOMOKU_SHOTS_DIR, GOMOKU_SHOTS_THEME), as in the other pages tests.
const shotsDir = process.env.GOMOKU_SHOTS_DIR;
const shotsTheme = process.env.GOMOKU_SHOTS_THEME === "dark" ? "dark" : "light";
const shot = async (browser: Browser, name: string) => {
  if (!shotsDir) return;
  // A moment for the last paint (a skeleton can still be in the first frame after the wait).
  await new Promise((resolve) => setTimeout(resolve, 400));
  await browser.run("screenshot", `${shotsDir}/${name}-${shotsTheme}.png`);
};
const resign = async (browser: Browser) => {
  await browser.click("[data-testid=resign]");
  await browser.waitFor("[role=alertdialog]");
  await browser.click("[role=alertdialog] button:last-child");
};

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  await creator.clearCookies();
});
afterAll(async () => {
  await orm.close();
  await creator.setHeaders({});
  await creator.clearCookies();
  await creator.setViewport(1280, 900);
});
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Record<string, unknown>[]>(text, params);

let counter = 0;
const nextAddress = () => `198.61.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

async function visitor(browser: Browser) {
  await browser.setHeaders({ "x-forwarded-for": nextAddress() });
  await browser.clearCookies();
  // Only for the review screenshots: the theme of the page comes from this cookie.
  if (shotsDir) await browser.setCookie("gomoku_theme", shotsTheme, baseUrl);
  await browser.setViewport(1280, 900);
}

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "pages-test", version: "1" },
};
/** The MCP client: `tools/call join` as `fetch`, from an address of its own. */
async function agentJoins(code: string, agentName?: string) {
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-for": nextAddress(),
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/call",
      "mcp-name": "join",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "join", arguments: { code, ...(agentName ? { agentName } : {}) }, _meta: META },
    }),
  });
  const { result } = (await response.json()) as { result: { isError?: boolean; structuredContent: { gameId: string } } };
  expect(result.isError).toBeUndefined();
  return result.structuredContent;
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const click = (browser: Browser, text: string) => browser.run("find", "text", text, "click", "--exact");
const pathOf = async (browser: Browser) => new URL(await browser.url()).pathname;
const codeOf = (browser: Browser) => browser.evaluate<string>("document.querySelectorAll('dd')[1].textContent");
const names = (browser: Browser) =>
  browser.evaluate<string[]>("[...document.querySelectorAll('[data-testid=player-name]')].map((n) => n.textContent)");

async function createAsGuest(nickname: string) {
  await creator.open(`${baseUrl}/`);
  await click(creator, "Zagraj ze znajomym bez konta");
  await creator.waitFor("#guest-nickname");
  await creator.fill("#guest-nickname", nickname);
  await creator.click("[data-testid=guest-create]");
  await creator.waitForFn("location.pathname.startsWith('/games/')");
  await bodyHas(creator, "Czekamy na przeciwnika…");
  return { path: await pathOf(creator), code: await codeOf(creator) };
}

describe("an agent joins the game of a guest", () => {
  it("shows the creator 'Agent dołączył do partii' and then Agent with the declared name, never a nickname", async () => {
    await visitor(creator);
    const { path, code } = await createAsGuest("Ala");

    await agentJoins(code, "claude opus 5.5");

    await bodyHas(creator, "Agent · claude opus 5.5 (deklarowane) dołączył do partii");
    await bodyHas(creator, "Partia w toku");
    const shown = await names(creator);
    // The opponent is the agent by its label; the only nickname on the screen is the creator's own.
    expect(shown).toEqual(["Agent · claude opus 5.5 (deklarowane)", "Ty: Ala (gość)"]);
    // Plain text: the name is a text node, no link or markup inside the label.
    expect(await creator.evaluate<number>("document.querySelectorAll('[data-testid=player-name] a, [data-testid=player-name] *:not(span)').length")).toBe(0);
    expect(await creator.evaluate<string>("document.querySelector('[data-testid=player-name]').getAttribute('title')")).toBe("Agent · claude opus 5.5 (deklarowane)");

    // Resigning ends the game: a result, no rematch button, the hint instead.
    await shot(creator, "agent-partia-1280");
    await resign(creator);
    await creator.waitForFn("document.body.innerText.includes('Przegrałeś')");
    await bodyHas(creator, "Aby zagrać z agentem jeszcze raz, utwórz nową partię i przekaż mu nowy kod.");
    expect(await creator.count("[data-testid=rematch-offer]")).toBe(0);
    expect(await pathOf(creator)).toBe(path);
    await shot(creator, "agent-koniec-1280");
  }, LONG);

  it("names an agent without a declared name just Agent, also while waiting for the creator to open the page", async () => {
    await visitor(creator);
    const { code } = await createAsGuest("Basia");

    await agentJoins(code);

    await bodyHas(creator, "Agent dołączył do partii");
    await shot(creator, "agent-dolaczyl-1280");
    await bodyHas(creator, "Partia w toku");
    expect(await names(creator)).toContain("Agent");
  }, LONG);

  it("keeps the whole label at 320 px: the long model name is cut, '(deklarowane)' stays", async () => {
    await visitor(creator);
    await creator.setViewport(320, 640);
    const { code } = await createAsGuest("Czesia");
    const long = "qwen2.5-coder-32b-instruct/preview (v2)";

    await agentJoins(code, long);

    await bodyHas(creator, "Partia w toku");
    await shot(creator, "agent-partia-320");
    await creator.setViewport(360, 740);
    await shot(creator, "agent-partia-360");
    await creator.setViewport(320, 640);
    const label = await creator.evaluate<{ title: string; text: string; scroll: number; client: number; suffixVisible: boolean }>(`(() => {
      const el = document.querySelector('[data-testid=player-name]');
      const suffix = [...el.querySelectorAll('span')].at(-1);
      const rect = suffix.getBoundingClientRect();
      return { title: el.getAttribute('title'), text: el.textContent, scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth, suffixVisible: rect.left >= 0 && rect.right <= document.documentElement.clientWidth };
    })()`);
    expect(label.title).toBe(`Agent · ${long} (deklarowane)`);
    expect(label.text).toBe(`Agent · ${long} (deklarowane)`);
    expect(label.suffixVisible).toBe(true);
    // No horizontal scroll of the page.
    expect(label.scroll).toBeLessThanOrEqual(label.client);
  }, LONG);
});

describe("an agent joins the game of an account", () => {
  it("is Agent in the history of the account, with the declared name", async () => {
    await visitor(creator);
    const n = `${Date.now().toString(36)}${++counter}`;
    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
      body: JSON.stringify({ email: `agentpages-${n}@example.com`, displayName: `AP_${n}`, password: "secret123" }),
    });
    expect(register.status).toBe(201);
    const pair = (register.headers.get("set-cookie") ?? "").split(";")[0]!;
    await creator.setCookie(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1), baseUrl);

    await creator.open(`${baseUrl}/`);
    await creator.click("[data-testid=create-game]");
    await creator.waitForFn("location.pathname.startsWith('/games/')");
    await bodyHas(creator, "Czekamy na przeciwnika…");
    const gameId = (await pathOf(creator)).split("/")[2]!;
    const code = await codeOf(creator);
    await agentJoins(code, "gpt-5");
    await bodyHas(creator, "Partia w toku");
    await resign(creator);
    await creator.waitForFn("document.body.innerText.includes('Przegrałeś')");

    await creator.open(`${baseUrl}/history`);
    await bodyHas(creator, "Zakończone partie");
    await creator.waitForFn("[...document.querySelectorAll('[data-testid=player-name]')].some((n) => n.textContent === 'Agent · gpt-5 (deklarowane)')");
    await shot(creator, "agent-historia-1280");
    expect((await run(`select kind from game_players where game_id = ? and seat = 2`, [gameId]))[0]).toEqual({ kind: "agent" });
  }, LONG);
});
