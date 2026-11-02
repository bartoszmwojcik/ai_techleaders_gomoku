// A game with an MCP agent that is also public (E10-S06, #212, BR-40): the creator ticks "public"
// as for any invitation, the agent joins and plays through `join`/`get_state`/`play_move` exactly as
// in a private game while a spectator watches (BR-39); the spectator never gets the agent token,
// is no MCP participant (their cookie is no token) and the agent sees their words only as
// `from: "spectator"` (BR-41). Against the built app and a real PostgreSQL.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.71.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1" },
};
type ToolResult = { isError?: boolean; structuredContent: Json };
async function tool(name: string, args: Json): Promise<ToolResult> {
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
  return ((await response.json()) as { result: ToolResult }).result;
}

function call(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": nextAddress(),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };

/** An account creates a game (public or not), an agent joins, the creator opens the page: the clock runs. */
async function agentGame(isPublic: boolean) {
  const n = `${Date.now().toString(36)}${++counter}`;
  const registered = await call("POST", "/api/auth/register", {
    email: `agentpub-${n}@example.com`,
    displayName: `Pub_${n}`,
    password: "secret123",
  });
  expect(registered.status).toBe(201);
  const owner = cookieOf(registered);
  const created = await json(await call("POST", "/api/games", isPublic ? { isPublic: true } : {}, owner));
  const gameId = created.data.gameId as string;
  const code = created.data.invitation.code as string;
  const joined = await tool("join", { code, agentName: "probe model 1" });
  expect(joined.isError).toBeUndefined();
  expect((await call("GET", `/api/games/${gameId}`, undefined, owner)).status).toBe(200);
  const [row] = await run(`select black_seat, is_public from games where id = ?`, [gameId]);
  return { gameId, code, owner, token: joined.structuredContent.token as string, agentBlack: row!.black_seat === 2, isPublic: row!.is_public as boolean };
}

describe("a public game with an agent (BR-40)", () => {
  it("is public when the creator ticked it, and the agent joins and plays as in a private game", async () => {
    const game = await agentGame(true);
    expect(game.isPublic).toBe(true);
    const state = await tool("get_state", { token: game.token });
    expect(state.isError).toBeUndefined();
    expect(state.structuredContent).toMatchObject({ status: "active", opponent: { kind: "account" } });
    // The tools know nothing of the audience: no field about publicity or spectators (BR-39, MCP unchanged).
    expect(JSON.stringify(state.structuredContent)).not.toMatch(/public|spectator/i);

    let moveNumber = 1;
    if (!game.agentBlack) {
      expect((await call("POST", `/api/games/${game.gameId}/moves`, { x: 0, y: 14, moveNumber }, game.owner)).status).toBe(200);
      moveNumber += 1;
    }
    const played = await tool("play_move", { token: game.token, x: 7, y: 7, moveNumber });
    expect(played.isError).toBeUndefined();
    expect(played.structuredContent.board[7][7]).toBe(game.agentBlack ? "B" : "W");
  });

  it("stays private without the tick (regression)", async () => {
    const game = await agentGame(false);
    expect(game.isPublic).toBe(false);
    expect((await call("POST", `/api/invitations/${game.code}/spectate`, {})).status).toBe(410);
  });

  it("lets a spectator watch the agent's moves, without the agent token, and without making them an MCP participant", async () => {
    const game = await agentGame(true);
    const spectated = await call("POST", `/api/invitations/${game.code}/spectate`, { nickname: "Zosia" });
    expect(spectated.status).toBe(200);
    const spectator = cookieOf(spectated);

    let moveNumber = 1;
    if (!game.agentBlack) {
      expect((await call("POST", `/api/games/${game.gameId}/moves`, { x: 0, y: 14, moveNumber }, game.owner)).status).toBe(200);
      moveNumber += 1;
    }
    expect((await tool("play_move", { token: game.token, x: 5, y: 5, moveNumber })).isError).toBeUndefined();

    const watched = await call("GET", `/api/games/${game.gameId}/spectate`, undefined, spectator);
    expect(watched.status).toBe(200);
    const body = await watched.text();
    expect(body).toContain("probe model 1");
    expect(JSON.parse(body).data.moveCount).toBeGreaterThan(0);
    // Nothing that opens the agent's seat.
    expect(body).not.toContain(game.token);
    expect(body).not.toMatch(/agent_?token|"token"|"code"/i);
    expect(body).not.toContain(game.code);

    // The spectator's cookie is no token of an MCP participant, and nor is anything they hold.
    for (const token of [spectator.split("=")[1]!, "x".repeat(43)]) {
      const refused = await tool("get_state", { token });
      expect(refused.isError).toBe(true);
      expect(refused.structuredContent.error.code).toBe("INVALID_TOKEN");
    }
    expect(Number((await run(`select count(*) as n from game_players where game_id = ?`, [game.gameId]))[0]!.n)).toBe(2);
  });

  it("shows the agent a spectator's words as from the spectator, never as the opponent", async () => {
    const game = await agentGame(true);
    const spectator = cookieOf(await call("POST", `/api/invitations/${game.code}/spectate`, { nickname: "Zosia" }));
    const sent = await call("POST", `/api/games/${game.gameId}/spectate/chat`, { text: "Powodzenia!", clientId: crypto.randomUUID() }, spectator);
    expect(sent.status).toBe(201);

    const state = await tool("get_state", { token: game.token });
    expect(state.isError).toBeUndefined();
    const messages = state.structuredContent.chat as Json[];
    expect(messages).toEqual([expect.objectContaining({ from: "spectator", text: "Powodzenia!", untrusted: true })]);
  });
});
