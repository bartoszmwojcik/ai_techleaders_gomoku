// A bot vs agent show on the built app and a real PostgreSQL (E14-S03, #283; spec 2026-11-09-show-mode, phase c): the
// administrator creates it (bot in seat 1, `waiting`, a code of 30 minutes), an MCP client joins it by `fetch` on
// `/api/mcp` and plays while the bot answers on the agent's `get_state` with no administrator's view open; a third
// joiner and a person in the browser get `INVALID_INVITATION`; the chat is `unavailable`; a silent agent loses on time;
// a waiting show expires, and the view tells that apart from an end by the administrator.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { ADMIN_EMAIL, adminCreate } from "./admin";

const baseUrl = inject("baseUrl");
const ADMIN_PASSWORD = "Admin-agent-456";
const PASSWORD = "secret123";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let orm: Orm;
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Json[]>(text, params);

let addressCounter = 0;
const nextAddress = () => `198.54.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
const headers = (cookie?: string): Record<string, string> => ({
  "content-type": "application/json",
  origin: baseUrl,
  "x-gomoku-request": "1",
  "x-forwarded-for": nextAddress(),
  ...(cookie ? { cookie } : {}),
});
const post = (path: string, body?: unknown, cookie?: string) =>
  fetch(`${baseUrl}${path}`, { method: "POST", headers: headers(cookie), body: body === undefined ? undefined : JSON.stringify(body) });
const get = (path: string, cookie?: string) => fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const login = async (email: string, password: string) => {
  const response = await post("/api/auth/login", { email, password });
  expect(response.status).toBe(200);
  return cookieOf(response);
};

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1" },
};
type ToolResult = { isError?: boolean; structuredContent: Json };
/** One MCP tool call as a stateless client sends it: a plain `fetch` on `/api/mcp`. */
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

let admin = "";

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  await run(`delete from users where email = ?`, [ADMIN_EMAIL]);
  await adminCreate(ADMIN_PASSWORD, ["--name", "Szef_Agenta"]);
  admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
});
afterAll(async () => {
  await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
  await orm.close();
});
beforeEach(async () => {
  await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
  await run(`delete from rate_limit_buckets where "key" like 'show-create:%'`);
});

type Created = { gameId: string; invitation: { code: string; url: string; mcpUrl: string; expiresAt: string } };
async function createShow(botLevel: 1 | 2 = 1): Promise<Created> {
  const response = await post("/api/show", { layout: "bot-agent", botLevel }, admin);
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: Created }).data;
}
const readShow = async (gameId: string) => {
  const response = await get(`/api/show/${gameId}`, admin);
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: Json }).data;
};
const join = (code: string) => tool("join", { code, agentName: "claude opus 5.5" });

/** The first free cell from the centre outwards, so the agent's moves are always legal. */
function freeCell(moves: { x: number; y: number }[]): { x: number; y: number } {
  const taken = new Set(moves.map(({ x, y }) => `${x},${y}`));
  for (let ring = 0; ring < 8; ring++) {
    for (let x = 7 - ring; x <= 7 + ring; x++) {
      for (let y = 7 - ring; y <= 7 + ring; y++) if (!taken.has(`${x},${y}`)) return { x, y };
    }
  }
  throw new Error("no free cell");
}

describe("creating a bot vs agent show (P4, P11, P12)", () => {
  it("writes a waiting private show with the bot in seat 1 and a code of 30 minutes, shown only while it waits", async () => {
    const before = Date.now();
    const show = await createShow(2);

    expect(show.invitation.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(show.invitation.mcpUrl).toMatch(/\/api\/mcp$/);
    const ttl = Date.parse(show.invitation.expiresAt) - before;
    expect(ttl).toBeGreaterThan(29 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000 + 5_000);
    const [game] = await run(`select status, origin, is_public, black_seat, turn_started_at from games where id = ?`, [show.gameId]);
    expect(game).toMatchObject({ status: "waiting", origin: "show", is_public: false, black_seat: null, turn_started_at: null });
    const players = await run(`select seat, kind, bot_level, user_id from game_players where game_id = ? order by seat`, [show.gameId]);
    expect(players).toEqual([{ seat: 1, kind: "bot", bot_level: 2, user_id: null }]);

    const state = await readShow(show.gameId);
    expect(state).toMatchObject({ status: "waiting", layout: "bot-agent", invitation: { code: show.invitation.code } });
    const overview = (await (await get("/api/show", admin)).json()).data;
    expect(overview.current).toEqual({ gameId: show.gameId, status: "waiting", layout: "bot-agent" });
  });

  it("is refused to a person in the browser, in the page and in the accept (P13, negative)", async () => {
    const show = await createShow();
    const n = Date.now().toString(36);
    const email = `pokaz-osoba-${n}@example.com`;
    expect((await post("/api/auth/register", { email, displayName: `osoba_${n}`.slice(0, 24), password: PASSWORD })).status).toBe(201);
    const person = await login(email, PASSWORD);
    const code = show.invitation.code.replace("-", "");

    const accept = await post(`/api/invitations/${code}/accept`, { as: "user" }, person);
    expect(accept.status).toBe(410);
    expect((await accept.json()).error.code).toBe("INVALID_INVITATION");
    expect(await (await get(`/invite/${show.invitation.code}`, person)).text()).toContain("To zaproszenie jest już nieważne");
    expect((await readShow(show.gameId)).status).toBe("waiting");
  });
});

describe("the agent joins and plays against the bot over MCP (P14)", () => {
  it("takes seat 2, the code is gone, a third joiner is refused, and the bot answers the agent's get_state alone", async () => {
    const show = await createShow();

    const joined = await join(show.invitation.code);
    expect(joined.isError).toBeUndefined();
    expect(joined.structuredContent).toMatchObject({ gameId: show.gameId, you: { seat: 2 }, status: "active", opponent: { kind: "bot" } });
    const token = joined.structuredContent.token as string;
    const [game] = await run(`select black_seat, started_at, turn_started_at from games where id = ?`, [show.gameId]);
    expect([1, 2]).toContain(game!.black_seat);
    // The clock runs from the join (no one else has to open the show).
    expect(game!.turn_started_at).not.toBeNull();

    const third = await join(show.invitation.code);
    expect(third.isError).toBe(true);
    expect(third.structuredContent.error).toMatchObject({ code: "INVALID_INVITATION" });

    // No read of the administrator from here on: only the agent's calls move the bot.
    let state = (await tool("get_state", { token, waitSeconds: 10 })).structuredContent;
    expect(state).toMatchObject({ status: "active", opponent: { kind: "bot" }, chatStatus: "unavailable", turn: "you" });
    for (let round = 0; round < 3; round++) {
      const moveCount = state.moves.length as number;
      const played = await tool("play_move", { token, ...freeCell(state.moves), moveNumber: state.nextMoveNumber });
      expect(played.isError).toBeUndefined();
      // play_move does not move the bot: the answer stops at the agent's own move (P14).
      expect(played.structuredContent).toMatchObject({ turn: "opponent" });
      expect(played.structuredContent.moves).toHaveLength(moveCount + 1);
      state = (await tool("get_state", { token, waitSeconds: 10 })).structuredContent;
      expect(state.status).toBe("active");
      expect(state.turn).toBe("you");
      expect(state.moves).toHaveLength(moveCount + 2);
    }
    const [{ n }] = (await run(`select move_count as n from games where id = ?`, [show.gameId])) as [{ n: number }];
    expect(n).toBeGreaterThanOrEqual(6);

    // The view sees the same game, without the code and with the agent's declared name.
    const view = await readShow(show.gameId);
    expect(view).toMatchObject({ status: "active", layout: "bot-agent" });
    expect(view).not.toHaveProperty("invitation");
    expect(view.players[1]).toMatchObject({ seat: 2, kind: "agent", agentName: "claude opus 5.5" });

    // The chat of a game with a bot is unavailable to the agent too.
    const sent = await tool("send_message", { token, text: "Dzień dobry" });
    expect(sent.isError).toBe(true);
    expect(sent.structuredContent.error).toMatchObject({ code: "CHAT_UNAVAILABLE" });
  });

  it("ends a silent agent's show on time: the bot wins (B5)", async () => {
    const show = await createShow();
    const token = (await join(show.invitation.code)).structuredContent.token as string;
    // The agent is black (on turn at the first move) and its clock ran out: shortened in the database.
    await run(`update games set black_seat = 2, turn_started_at = now() - interval '11 minutes' where id = ?`, [show.gameId]);

    const view = await readShow(show.gameId);
    expect(view).toMatchObject({ status: "finished", result: { winnerSeat: 1, reason: "timeout" } });
    const seen = (await tool("get_state", { token })).structuredContent;
    expect(seen).toMatchObject({ status: "finished", result: { outcome: "loss", reason: "timeout" } });
  });
});

describe("a waiting show without its agent", () => {
  it("expires lazily, the view says so, and the code no longer seats an agent", async () => {
    const show = await createShow();
    await run(`update invitations set expires_at = now() - interval '1 second' where game_id = ?`, [show.gameId]);

    const view = await readShow(show.gameId);
    expect(view).toMatchObject({ status: "cancelled", closedReason: "expired" });
    expect(view).not.toHaveProperty("invitation");
    const late = await join(show.invitation.code);
    expect(late.structuredContent.error).toMatchObject({ code: "INVALID_INVITATION" });
    expect((await (await get("/api/show", admin)).json()).data.current).toBeNull();
  });

  it("ended by the administrator is told apart from an expiry, and its code is void", async () => {
    const show = await createShow();

    const ended = await post(`/api/show/${show.gameId}/end`, undefined, admin);
    expect(ended.status).toBe(200);
    expect((await ended.json()).data).toMatchObject({ status: "cancelled", closedReason: "ended" });
    expect(await readShow(show.gameId)).toMatchObject({ closedReason: "ended" });
    expect((await join(show.invitation.code)).structuredContent.error).toMatchObject({ code: "INVALID_INVITATION" });
  });
});
