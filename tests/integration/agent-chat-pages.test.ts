// A human writes in the chat of a real browser, an agent (an MCP client over HTTP) reads it in
// `get_state` as untrusted data and answers with `send_message`, and the human sees the answer in the
// page, signed as the agent with the name it declared (E07-S04, D-31).
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const human = new Browser(`${inject("browserSession")}-agentchat`);

beforeAll(async () => {
  await human.clearCookies();
});
afterAll(async () => {
  await human.setHeaders({});
  await human.clearCookies();
  await human.close();
});

let counter = 0;
const nextAddress = () => `198.90.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1" },
};
async function tool(name: string, args: Json): Promise<Json> {
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-for": nextAddress(),
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/call",
      "mcp-name": name,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: META } }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: Json }).result;
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

describe("the chat between a human in the browser and an agent over MCP", () => {
  it(
    "shows the human's text to the agent and the agent's answer to the human, signed as the agent",
    async () => {
      const n = `${Date.now().toString(36)}${++counter}`;
      const registered = await api("POST", "/api/auth/register", {
        email: `agentchatpage-${n}@example.com`,
        displayName: `Czł_${n}`,
        password: "secret123",
      });
      expect(registered.status).toBe(201);
      const pair = (registered.headers.getSetCookie?.() ?? []).find((line) => line.startsWith("gomoku_session="))!.split(";")[0]!;
      const created = await api("POST", "/api/games", {}, pair);
      const { gameId, invitation } = ((await created.json()) as { data: { gameId: string; invitation: { code: string } } }).data;
      const joined = await tool("join", { code: invitation.code, agentName: "browserprobe 1" });
      const token = joined.structuredContent.token as string;

      await human.clearCookies();
      await human.setCookie("gomoku_session", pair.slice("gomoku_session=".length), baseUrl);
      await human.setViewport(360, 900);
      await human.open(`${baseUrl}/games/${gameId}`);
      await human.waitFor("input[name=message]");

      await human.fill("input[name=message]", "Cześć agencie, zagraj spokojniej");
      await human.press("Enter");
      await human.waitForFn(`document.body.innerText.includes("Cześć agencie, zagraj spokojniej")`);

      const read = await tool("get_state", { token });
      expect(read.structuredContent.chat).toEqual([
        { id: 1, from: "opponent", text: "Cześć agencie, zagraj spokojniej", untrusted: true },
      ]);
      expect(read.structuredContent.chatStatus).toBe("open");

      const sent = await tool("send_message", { token, text: "Dziękuję, postaram się" });
      expect(sent.isError).toBeUndefined();

      await human.waitForFn(`document.body.innerText.includes("Dziękuję, postaram się")`);
      const log = await human.text("[role=log]");
      expect(log).toContain("Agent");
      expect(log).toContain("browserprobe 1");
      expect(await human.evaluate<boolean>("document.documentElement.scrollWidth <= document.documentElement.clientWidth")).toBe(true);
    },
    90_000,
  );
});
