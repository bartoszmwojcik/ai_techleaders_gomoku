// The "Jak podłączyć agenta" panel on the waiting screen (E06-S04, D-28) in a real browser: a
// guest creates a game, expands the panel, sees the MCP address and the command, copies the code,
// the page does not scroll sideways at 320 px in both themes, the panel works from the keyboard,
// the REST view carries `invitation.mcpUrl`, and the panel is gone once an agent has joined.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const LONG = 120_000;

const baseUrl = inject("baseUrl");
const creator = new Browser(inject("browserSession"));

beforeAll(async () => {
  await creator.clearCookies();
});
afterAll(async () => {
  await creator.setHeaders({});
  await creator.clearCookies();
  await creator.setViewport(1280, 900);
});

let counter = 0;
const nextAddress = () => `198.62.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

async function visitor(browser: Browser, theme: "light" | "dark" = "light") {
  await browser.setHeaders({ "x-forwarded-for": nextAddress() });
  await browser.clearCookies();
  await browser.setCookie("gomoku_theme", theme, baseUrl);
  await browser.setViewport(1280, 900);
}

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "hint-test", version: "1" },
};
async function agentJoins(code: string) {
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
      params: { name: "join", arguments: { code }, _meta: META },
    }),
  });
  const { result } = (await response.json()) as { result: { isError?: boolean } };
  expect(result.isError).toBeUndefined();
}

const bodyHas = (browser: Browser, text: string) =>
  browser.waitForFn(`document.body.innerText.includes(${JSON.stringify(text)})`);
const noSideScroll = (browser: Browser) =>
  browser.evaluate<boolean>("document.documentElement.scrollWidth <= document.documentElement.clientWidth");

async function createAsGuest(nickname: string) {
  await creator.open(`${baseUrl}/`);
  await creator.run("find", "text", "Zagraj ze znajomym bez konta", "click", "--exact");
  await creator.waitFor("#guest-nickname");
  await creator.fill("#guest-nickname", nickname);
  await creator.click("[data-testid=guest-create]");
  await creator.waitForFn("location.pathname.startsWith('/games/')");
  await bodyHas(creator, "Czekamy na przeciwnika…");
  return creator.evaluate<string>("document.querySelectorAll('dd')[1].textContent");
}

describe("the agent hint on the waiting screen", () => {
  it(
    "is collapsed, opens from the keyboard and shows the address, the command and the code",
    async () => {
      await visitor(creator);
      const code = await createAsGuest("Ala");

      expect(await creator.evaluate<boolean>("document.querySelector('details').open")).toBe(false);
      await creator.run("focus", "details > summary");
      await creator.press("Enter");
      expect(await creator.evaluate<boolean>("document.querySelector('details').open")).toBe(true);

      const origin = await creator.evaluate<string>("location.origin");
      const text = await creator.text("details");
      expect(text).toContain("Jak podłączyć agenta");
      expect(text).toContain(`${origin}/api/mcp`);
      expect(text).toContain(`claude mcp add --transport http gomoku ${origin}/api/mcp`);
      expect(text).toContain(code);
      expect(text).toContain("Agent może czytać czat partii i na nim pisać");
      expect(text).toContain("Nie wpisuj tajnych danych. Czat możesz wyłączyć w partii.");

      await creator.evaluate("document.querySelector('[data-copy=code]').nextElementSibling.querySelector('button').click()");
      await bodyHas(creator, "Skopiowano");
      expect(await creator.text("[data-testid=copy-status]")).toMatch(/Skopiowano kod|Tekst jest zaznaczony/);
    },
    LONG,
  );

  it(
    "does not scroll sideways at 320 px, expanded, in both themes",
    async () => {
      for (const theme of ["light", "dark"] as const) {
        await visitor(creator, theme);
        await createAsGuest(`Ala_${theme}`);
        await creator.setViewport(320, 700);
        await creator.click("details > summary");
        await creator.waitForFn("document.querySelector('details').open");
        expect(await noSideScroll(creator)).toBe(true);
        await creator.setViewport(1280, 900);
      }
    },
    LONG,
  );

  it(
    "serves invitation.mcpUrl in the REST view and drops the panel when an agent joins",
    async () => {
      await visitor(creator);
      const code = await createAsGuest("Basia");
      const gameId = new URL(await creator.url()).pathname.split("/").pop()!;
      const cookies = (await creator.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
      const response = await fetch(`${baseUrl}/api/games/${gameId}`, { headers: { cookie: cookies, "x-forwarded-for": nextAddress() } });
      const { data } = (await response.json()) as { data: { invitation: { mcpUrl: string } } };
      expect(data.invitation.mcpUrl).toBe(`${baseUrl}/api/mcp`);

      await agentJoins(code);
      await bodyHas(creator, "Agent dołączył do partii");
      expect(await creator.count("details")).toBe(0);
    },
    LONG,
  );
});
