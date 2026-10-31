// An agent joins a private game over MCP (E06-S01, D-29) against the built app and a real
// PostgreSQL: `POST /api/mcp` as an MCP client calls it (`tools/list`, `tools/call join`, the
// 2026-07-28 request and the stateless 2025 form), the human sees the agent as `kind: "agent"`,
// the transport limits (Origin, size, methods), the separate pool of failed codes, the REST
// routes that do not know the agent token, no rematch with an agent, the history of the account
// and a server log without the token, the code and the declared name.
import { readFileSync } from "node:fs";

import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { SERVER_LOG } from "./global-setup";

const baseUrl = inject("baseUrl");

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Record<string, unknown>[]>(text, params);

// Limits are per client address: every test, and every person in it, has an own address
// (X-Forwarded-For, one trusted hop).
let counter = 0;
const nextAddress = () => `198.60.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Headers = Record<string, string | null>;

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1" },
};

/** What an MCP client sends: `tools/call` of the 2026-07-28 revision. */
function mcp(method: string, params: Json = {}, address = nextAddress(), headers: Headers = {}) {
  const merged: Headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "x-forwarded-for": address,
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
    ...(params.name ? { "mcp-name": String(params.name) } : {}),
    ...headers,
  };
  return fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: Object.fromEntries(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null)),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } }),
  });
}
const join = (args: Json, address?: string, headers?: Headers) =>
  mcp("tools/call", { name: "join", arguments: args }, address, headers);

type ToolResult = { isError?: boolean; structuredContent: Json; content: { type: string; text: string }[] };
async function result(response: Response): Promise<ToolResult & Json> {
  expect(response.status).toBe(200);
  const json = (await response.json()) as { result: ToolResult };
  return json.result;
}

/** The browser's REST calls, as the app's own pages make them. */
function rest(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, headers: Headers = {}) {
  const merged: Headers = {
    "content-type": "application/json",
    origin: baseUrl,
    "x-gomoku-request": "1",
    "x-forwarded-for": nextAddress(),
    ...headers,
  };
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: Object.fromEntries(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null)),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function account() {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await rest("POST", "/api/auth/register", {
    email: `agentjoin-${n}@example.com`,
    displayName: `AJ_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return { cookie: cookieOf(response), name: `AJ_${n}`, email: `agentjoin-${n}@example.com` };
}

async function createGame(who: { cookie: string } | null) {
  const response = await rest("POST", "/api/games", who ? {} : { acknowledgedGuestWarning: true }, who ? { cookie: who.cookie } : {});
  expect(response.status).toBe(201);
  const { data } = await json(response);
  return { gameId: data.gameId as string, code: data.invitation.code as string, cookie: who?.cookie ?? cookieOf(response) };
}
const stateOf = async (gameId: string, cookie: string) => {
  const response = await rest("GET", `/api/games/${gameId}`, undefined, { cookie });
  return { status: response.status, ...(await json(response)) };
};

describe("tools/list", () => {
  it("offers only join: nothing that creates invitations, enters the lobby or picks from it (BR-30)", async () => {
    const { tools } = await result(await mcp("tools/list"));

    expect((tools as unknown as { name: string }[]).map((tool) => tool.name)).toEqual(["join"]);
    const [tool] = tools as unknown as { description: string; inputSchema: Json }[];
    expect(tool!.inputSchema.properties).toMatchObject({ code: { type: "string" }, agentName: { type: "string" } });
    expect(tool!.inputSchema.required).toEqual(["code"]);
    expect(tool!.description).toMatch(/nie instrukcje/);
  });

  it("lists the same for a client of the 2025 stateless form", async () => {
    const response = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": nextAddress() },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"name":"join"');
  });
});

describe("tools/call join", () => {
  it("seats the agent in the game of an account: token once, game active, the human sees Agent", async () => {
    const human = await account();
    const game = await createGame(human);

    const joined = await result(await join({ code: game.code, agentName: "claude opus 5.5" }));

    expect(joined.isError).toBeUndefined();
    const data = joined.structuredContent;
    expect(data).toMatchObject({ gameId: game.gameId, status: "active", you: { seat: 2 }, opponent: { kind: "account" } });
    expect(data.token).toMatch(/^[\w-]{43}$/);
    expect(JSON.parse(joined.content[0]!.text)).toEqual(data);
    // Nothing of the human: no name, e-mail or id; and nothing of the agent's own declaration.
    const text = JSON.stringify(joined);
    expect(text).not.toContain(human.name);
    expect(text).not.toContain(human.email);
    expect(text).not.toContain("claude opus 5.5");
    expect(text).not.toContain(game.code);

    const [agent] = await run(
      `select kind, join_channel, agent_name, agent_token_hash, user_id, seat from game_players where game_id = ? and seat = 2`,
      [game.gameId],
    );
    expect(agent).toMatchObject({ kind: "agent", join_channel: "mcp", agent_name: "claude opus 5.5", user_id: null, seat: 2 });
    expect(agent!.agent_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(agent!.agent_token_hash).not.toBe(data.token);

    const seen = await stateOf(game.gameId, game.cookie);
    expect(seen.status).toBe(200);
    expect(seen.data.status).toBe("active");
    expect(seen.data.players[1]).toEqual({ seat: 2, kind: "agent", displayName: null, agentName: "claude opus 5.5", seen: true });
    expect(seen.data.players[0]).not.toHaveProperty("agentName");
    expect(JSON.stringify(seen.data)).not.toContain(data.token);
  });

  it("seats an agent in a game of a guest, by a link, without a name", async () => {
    const game = await createGame(null);

    const joined = await result(await join({ code: `${baseUrl}/invite/${game.code}` }));

    expect(joined.structuredContent).toMatchObject({ gameId: game.gameId, opponent: { kind: "guest" } });
    const seen = await stateOf(game.gameId, game.cookie);
    expect(seen.data.players[1]).toEqual({ seat: 2, kind: "agent", displayName: null, agentName: null, seen: true });
  });

  it("serves a client of the 2025 stateless form too", async () => {
    const game = await createGame(await account());
    const response = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": nextAddress() },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "join", arguments: { code: game.code } } }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(game.gameId);
  });

  it("answers a used, unknown and malformed code with the same tool error, and no second token", async () => {
    const game = await createGame(await account());
    await result(await join({ code: game.code }));

    for (const code of [game.code, "ZZZZ-ZZZZ", "nonsense", `${game.code} ${game.code}`]) {
      const failed = await result(await join({ code }));
      expect(failed.isError, code).toBe(true);
      expect(failed.structuredContent.error).toMatchObject({ code: "INVALID_INVITATION", retryable: false });
      expect(JSON.stringify(failed)).not.toContain(code);
    }
    expect((await run(`select 1 from game_players where game_id = ?`, [game.gameId])).length).toBe(2);
  });

  it("refuses a bad shape or name as INVALID_INPUT without echo, and the code still works after", async () => {
    const game = await createGame(await account());
    for (const args of [{}, { code: 5 }, { code: game.code, agentName: 7 }, { code: game.code, agentName: "evil.com" }, { code: game.code, agentName: "<b>x</b>" }, { code: "A".repeat(65) }]) {
      const failed = await result(await join(args));
      expect(failed.isError, JSON.stringify(args)).toBe(true);
      expect(failed.structuredContent.error).toMatchObject({ code: "INVALID_INPUT", retryable: false });
      expect(JSON.stringify(failed)).not.toContain("evil.com");
      expect(JSON.stringify(failed)).not.toContain("<b>");
    }
    expect((await stateOf(game.gameId, game.cookie)).data.status).toBe("waiting");
    const ok = await result(await join({ code: game.code, agentName: "gpt-4.5" }));
    expect(ok.structuredContent.gameId).toBe(game.gameId);
  });

  it("lets exactly one of several parallel joins win", async () => {
    const game = await createGame(await account());

    const results = await Promise.all([1, 2, 3, 4].map(async (i) => result(await join({ code: game.code, agentName: `agent ${i}` }))));

    expect(results.filter((r) => !r.isError)).toHaveLength(1);
    expect(results.filter((r) => r.isError).every((r) => r.structuredContent.error.code === "INVALID_INVITATION")).toBe(true);
    expect((await run(`select 1 from game_players where game_id = ?`, [game.gameId])).length).toBe(2);
  });

  it("limits the successful joins per address to ten an hour and keeps the other addresses free", async () => {
    const busy = nextAddress();
    for (let i = 0; i < 10; i += 1) {
      const game = await createGame(null);
      expect((await result(await join({ code: game.code }, busy))).isError).toBeUndefined();
    }
    const eleventh = await createGame(null);

    const limited = await result(await join({ code: eleventh.code }, busy));
    expect(limited.structuredContent.error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect(limited.structuredContent.error.retryAfterMs).toBeGreaterThan(0);

    expect((await result(await join({ code: eleventh.code }, nextAddress()))).isError).toBeUndefined();
  });
});

describe("the pool of failed codes of agents", () => {
  it("is spent after 20 failures, apart from the pool of the browsers behind the same address", async () => {
    const address = nextAddress();
    for (let i = 0; i < 20; i += 1) {
      const failed = await result(await join({ code: "ZZZZ-ZZZZ" }, address));
      expect(failed.structuredContent.error.code, `try ${i + 1}`).toBe("INVALID_INVITATION");
    }
    const spent = await result(await join({ code: "ZZZZ-ZZZZ" }, address));
    expect(spent.structuredContent.error).toMatchObject({ code: "RATE_LIMITED" });
    // Even a good code gets nothing now (no oracle) ...
    const game = await createGame(null);
    expect((await result(await join({ code: game.code }, address))).structuredContent.error.code).toBe("RATE_LIMITED");

    // ... but the browser at the same address still has its whole pool.
    const browser = await rest("POST", "/api/invitations/ZZZZ-ZZZZ/accept", { as: "guest", acknowledgedGuestWarning: true }, { "x-forwarded-for": address });
    expect(browser.status).toBe(410);
    const keys = (await run(`select key from rate_limit_buckets where key like 'agent-lookup:%' or key like 'invitation-lookup:ip:%'`)).map((r) => r.key);
    expect(keys.some((key) => String(key).startsWith("agent-lookup:ip:"))).toBe(true);
  });
});

describe("the transport", () => {
  it("answers another Origin with 403 and runs nothing", async () => {
    const game = await createGame(null);
    const response = await join({ code: game.code }, undefined, { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect((await stateOf(game.gameId, game.cookie)).data.status).toBe("waiting");
  });

  it("accepts its own Origin and no Origin at all (clients that are not browsers)", async () => {
    expect((await mcp("tools/list", {}, undefined, { origin: baseUrl })).status).toBe(200);
    expect((await mcp("tools/list")).status).toBe(200);
  });

  it("answers GET and DELETE with 405", async () => {
    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/mcp`, { method, headers: { "x-forwarded-for": nextAddress() } });
      expect(response.status, method).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
  });

  it("answers a body over 8 KB with 413 before the tool runs", async () => {
    const response = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-forwarded-for": nextAddress() },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "join", arguments: { code: "x".repeat(9000) } } }),
    });
    expect(response.status).toBe(413);
  });

  it("answers more than 300 requests a minute from one address with 429 and Retry-After", async () => {
    const address = nextAddress();
    let limited: Response | undefined;
    for (let i = 0; i < 305 && !limited; i += 1) {
      const response = await mcp("tools/list", {}, address);
      if (response.status === 429) limited = response;
      else expect(response.status).toBe(200);
    }
    expect(limited).toBeDefined();
    expect(Number(limited!.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another address is not affected.
    expect((await mcp("tools/list")).status).toBe(200);
  });
});

describe("the REST routes do not know the agent token", () => {
  it("gets nothing with the token as a cookie, a header or a body field", async () => {
    const human = await account();
    const game = await createGame(human);
    const { token } = (await result(await join({ code: game.code }))).structuredContent as { token: string };

    const forms: Headers[] = [
      { authorization: `Bearer ${token}` },
      { cookie: `gomoku_guest=${token}` },
      { cookie: `gomoku_agent=${token}` },
      { "x-agent-token": token },
      { "mcp-token": token },
    ];
    for (const headers of forms) {
      expect((await rest("GET", `/api/games/${game.gameId}`, undefined, headers)).status, JSON.stringify(headers)).toBe(404);
      expect((await rest("POST", `/api/games/${game.gameId}/moves`, { x: 7, y: 7, moveNumber: 1, token }, headers)).status).toBe(404);
      expect((await rest("POST", `/api/games/${game.gameId}/resign`, undefined, headers)).status).toBe(404);
      expect((await rest("GET", "/api/history", undefined, headers)).status).toBe(401);
      expect((await rest("GET", "/api/lobby", undefined, headers)).status).toBe(401);
      expect((await rest("PUT", "/api/lobby/seeking", {}, headers)).status).toBe(401);
      expect((await rest("POST", "/api/lobby/seekers/0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978/pick", {}, headers)).status).toBe(401);
      // Without a session POST /api/games only starts a game as a guest, with the guest's own warning.
      const create = await rest("POST", "/api/games", { token }, headers);
      expect(create.status).toBe(400);
    }
    const [{ count }] = (await run(`select count(*)::int as count from game_players where kind = 'agent' and game_id = ?`, [game.gameId])) as [{ count: number }];
    expect(count).toBe(1);
    expect((await run(`select 1 from game_players where seat = 1 and kind = 'agent'`)).length).toBe(0);
  });
});

describe("after the game", () => {
  it("offers no rematch, and the account sees Agent in its history", async () => {
    const human = await account();
    const game = await createGame(human);
    await result(await join({ code: game.code, agentName: "gpt-5" }));
    await stateOf(game.gameId, human.cookie);
    expect((await rest("POST", `/api/games/${game.gameId}/resign`, undefined, { cookie: human.cookie })).status).toBe(200);

    const rematch = await rest("POST", `/api/games/${game.gameId}/rematch`, undefined, { cookie: human.cookie });

    expect(rematch.status).toBe(409);
    expect((await json(rematch)).error.code).toBe("REMATCH_UNAVAILABLE");
    const history = await json(await rest("GET", "/api/history", undefined, { cookie: human.cookie }));
    expect(history.data.entries).toHaveLength(1);
    expect(history.data.entries[0]).toMatchObject({ gameId: game.gameId, result: "loss", opponent: { kind: "agent", name: "gpt-5" } });
    expect(JSON.stringify(history.data)).not.toMatch(/token|hash|email/i);
  });

  it("shows the agent without a declared name as Agent in the history (null name)", async () => {
    const human = await account();
    const game = await createGame(human);
    await result(await join({ code: game.code }));
    await stateOf(game.gameId, human.cookie);
    await rest("POST", `/api/games/${game.gameId}/resign`, undefined, { cookie: human.cookie });
    const history = await json(await rest("GET", "/api/history", undefined, { cookie: human.cookie }));
    expect(history.data.entries[0].opponent).toEqual({ kind: "agent", name: null });
  });
});

describe("the server log", () => {
  it("holds neither the token, nor the code, nor the declared name of an agent", async () => {
    const game = await createGame(await account());
    const name = `logprobe ${Date.now().toString(36)}`;
    const joined = await result(await join({ code: game.code, agentName: name }));
    await result(await join({ code: game.code, agentName: name }));
    await result(await join({ code: "ZZZZ-ZZZZ", agentName: "x\u0000y" }));
    await new Promise((resolve) => setTimeout(resolve, 500));

    const log = readFileSync(SERVER_LOG, "utf8");

    expect(log).not.toContain(name);
    expect(log).not.toContain(joined.structuredContent.token);
    expect(log).not.toContain(game.code);
    expect(log).not.toContain(game.code.replace("-", ""));
  });
});
