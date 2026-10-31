// An agent plays a game to the end over MCP (E06-S02, D-29) against the built app and a real
// PostgreSQL: `get_state` and `play_move` as an MCP client calls them, with a human on the other
// side through the REST API. The error contract (one shape, every code), a failed `play_move`
// leaving the game and the clocks as they were, parallel moves, the race for the last move, the
// loss on time, a token of another game and the absence of names, e-mails and ids in what the
// agent receives and in the server log.
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
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

// Limits are per client address: every call has an own address (X-Forwarded-For, one trusted hop).
let counter = 0;
const nextAddress = () => `198.70.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1" },
};

type ToolResult = { isError?: boolean; structuredContent: Json; content: { type: string; text: string }[] };
async function tool(name: string, args: Json, address = nextAddress()): Promise<ToolResult> {
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-for": address,
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/call",
      "mcp-name": name,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: META } }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: ToolResult }).result;
}
const getState = (token: string, extra: Json = {}, address?: string) => tool("get_state", { token, ...extra }, address);
const playMove = (token: string, x: number, y: number, moveNumber: number, address?: string) =>
  tool("play_move", { token, x, y, moveNumber }, address);

function rest(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
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
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

type Game = {
  gameId: string;
  token: string;
  cookie: string;
  name: string;
  email: string;
  userId: string;
  code: string;
  /** Seat of the agent's colour: it plays black when it is `true`. */
  agentBlack: boolean;
};

/** A game of an account and an agent with a running clock: the agent joined, the human opened the page. */
async function startedGame(agentName = "probe model 1"): Promise<Game> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const name = `Play_${n}`;
  const email = `agentplay-${n}@example.com`;
  const registered = await rest("POST", "/api/auth/register", { email, displayName: name, password: "secret123" });
  expect(registered.status).toBe(201);
  const cookie = cookieOf(registered);
  const created = await json(await rest("POST", "/api/games", {}, cookie));
  const gameId = created.data.gameId as string;
  const code = created.data.invitation.code as string;
  const joined = await tool("join", { code, agentName });
  expect(joined.isError).toBeUndefined();
  expect((await rest("GET", `/api/games/${gameId}`, undefined, cookie)).status).toBe(200);
  const token = joined.structuredContent.token as string;
  const [user] = await run(`select id from users where email = ?`, [email]);
  const [row] = await run(`select black_seat from games where id = ?`, [gameId]);
  return { gameId, token, cookie, name, email, code, userId: user!.id as string, agentBlack: row!.black_seat === 2 };
}

const humanMove = (game: Game, x: number, y: number, moveNumber: number) =>
  rest("POST", `/api/games/${game.gameId}/moves`, { x, y, moveNumber }, game.cookie);
const humanState = async (game: Game) => (await json(await rest("GET", `/api/games/${game.gameId}`, undefined, game.cookie))).data;

/** Plays the opening move of the human when the agent is white, so that the agent is on turn. */
async function untilAgentOnTurn(game: Game) {
  if (game.agentBlack) return;
  expect((await humanMove(game, 0, 14, 1)).status).toBe(200);
}

const snapshot = async (gameId: string) => {
  const [row] = await run(
    `select status, black_seat, move_count, stones_black::text as black, stones_white::text as white, encode(moves, 'hex') as moves,
       clock_ms_1, clock_ms_2, turn_started_at::text as turn_started_at, winner_seat, end_reason, finished_at::text as finished_at
     from games where id = ?`,
    [gameId],
  );
  return row!;
};

const errorOf = (result: ToolResult) => {
  expect(result.isError).toBe(true);
  return result.structuredContent.error as Json;
};

describe("a whole game over MCP", () => {
  it("is played to a five in a row by the agent, with the board, moves and clocks as the state shows them", async () => {
    const game = await startedGame();
    const agentMoves = [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]];
    const humanMoves = [[0, 0], [1, 0], [2, 0], [3, 0]];
    let moveNumber = 1;
    if (!game.agentBlack) {
      expect((await humanMove(game, 14, 14, moveNumber)).status).toBe(200);
      moveNumber += 1;
    }

    let last: Json = {};
    for (const [index, [x, y]] of agentMoves.entries()) {
      const before = await getState(game.token);
      expect(before.isError).toBeUndefined();
      expect(before.structuredContent).toMatchObject({
        status: "active",
        turn: "you",
        nextMoveNumber: moveNumber,
        opponent: { kind: "account" },
        you: { seat: 2, color: game.agentBlack ? "black" : "white" },
        result: null,
      });
      expect(before.structuredContent.board).toHaveLength(15);
      expect(before.structuredContent.clock.youMs).toBeGreaterThan(590_000);
      expect(before.structuredContent.clock.runningSide).toBe("you");
      expect(JSON.parse(before.content[0]!.text)).toEqual(before.structuredContent);

      const played = await playMove(game.token, x!, y!, moveNumber);
      expect(played.isError, `move ${moveNumber}`).toBeUndefined();
      last = played.structuredContent;
      expect(last.board[y!][x!]).toBe(game.agentBlack ? "B" : "W");
      moveNumber += 1;
      if (index < humanMoves.length) {
        expect(last.turn).toBe("opponent");
        expect(last.clock.runningSide).toBe("opponent");
        const [hx, hy] = humanMoves[index]!;
        expect((await humanMove(game, hx!, hy!, moveNumber)).status).toBe(200);
        moveNumber += 1;
      }
    }

    expect(last).toMatchObject({
      status: "finished",
      turn: null,
      retryAfterMs: null,
      result: { outcome: "win", reason: "five_in_row" },
    });
    expect(last.result.winLine).toEqual([3, 4, 5, 6, 7].map((x) => ({ x, y: 7 })));
    expect(last.clock.runningSide).toBeNull();

    // After the end: the state still answers (the result), moves are refused, the human sees the same.
    const after = await getState(game.token);
    expect(after.structuredContent).toMatchObject({ status: "finished", result: { outcome: "win" } });
    const refused = errorOf(await playMove(game.token, 10, 10, moveNumber));
    expect(refused).toMatchObject({ code: "GAME_FINISHED", retryable: false });
    const human = await humanState(game);
    expect(human).toMatchObject({ status: "finished", result: { reason: "five_in_row", winnerSeat: 2 } });
    expect(after.structuredContent.moves).toHaveLength(human.moveCount);
  });

  it("lists only the moves after afterMove and answers a repeat of the same move with the state", async () => {
    const game = await startedGame();
    await untilAgentOnTurn(game);
    const first = game.agentBlack ? 1 : 2;

    const played = await playMove(game.token, 7, 7, first);
    const again = await playMove(game.token, 7, 7, first);
    const view = await getState(game.token, { afterMove: first - 1 });
    const tail = await getState(game.token, { afterMove: first });
    const beyond = errorOf(await getState(game.token, { afterMove: first + 5 }));

    expect(played.isError).toBeUndefined();
    expect(again.isError).toBeUndefined();
    expect(again.structuredContent.nextMoveNumber).toBe(first + 1);
    expect(view.structuredContent.moves).toEqual([{ n: first, x: 7, y: 7, color: game.agentBlack ? "black" : "white" }]);
    expect(tail.structuredContent.moves).toEqual([]);
    expect(beyond).toMatchObject({ code: "INVALID_INPUT" });
    expect((await snapshot(game.gameId)).move_count).toBe(first);
  });

  it("waits for the turn of the agent and answers as soon as the human has moved", async () => {
    const game = await startedGame();
    if (game.agentBlack) {
      expect((await playMove(game.token, 7, 7, 1)).isError).toBeUndefined();
    } else {
      expect((await humanMove(game, 0, 14, 1)).status).toBe(200);
      expect((await playMove(game.token, 7, 7, 2)).isError).toBeUndefined();
    }
    const next = game.agentBlack ? 2 : 3;
    const startedAt = Date.now();
    setTimeout(() => void humanMove(game, 1, 14, next), 1500);

    const waited = await getState(game.token, { waitSeconds: 20 });

    expect(waited.structuredContent).toMatchObject({ turn: "you", nextMoveNumber: next + 1 });
    expect(Date.now() - startedAt).toBeGreaterThan(1000);
    expect(Date.now() - startedAt).toBeLessThan(15_000);
  });
});

describe("the errors of play_move", () => {
  it("have one shape and leave the game and the clocks as they were, for every code", async () => {
    // GAME_NOT_STARTED: nobody opened the page yet, so no clock runs.
    const n = `${Date.now().toString(36)}${++counter}`;
    const registered = await rest("POST", "/api/auth/register", { email: `ns-${n}@example.com`, displayName: `NS_${n}`, password: "secret123" });
    const created = await json(await rest("POST", "/api/games", {}, cookieOf(registered)));
    const joined = await tool("join", { code: created.data.invitation.code });
    const notStarted = { gameId: created.data.gameId as string, token: joined.structuredContent.token as string };

    // The agent on turn with (0, 14) occupied: a human opening as black, or the agent's own first move.
    const turn = await startedGame();
    if (turn.agentBlack) {
      expect((await playMove(turn.token, 0, 14, 1)).isError).toBeUndefined();
      expect((await humanMove(turn, 8, 8, 2)).status).toBe(200);
    } else {
      expect((await humanMove(turn, 0, 14, 1)).status).toBe(200);
    }
    const next = turn.agentBlack ? 3 : 2;

    // NOT_YOUR_TURN: the agent has moved, the human is on turn.
    const other = await startedGame();
    await untilAgentOnTurn(other);
    expect((await playMove(other.token, 7, 7, other.agentBlack ? 1 : 2)).isError).toBeUndefined();

    // GAME_FINISHED: the human resigned.
    const finished = await startedGame();
    expect((await rest("POST", `/api/games/${finished.gameId}/resign`, undefined, finished.cookie)).status).toBe(200);

    const cases: { name: string; gameId: string; token: string; call: () => Promise<ToolResult>; code: string; extra?: Json }[] = [
      { name: "GAME_NOT_STARTED", ...notStarted, call: () => playMove(notStarted.token, 7, 7, 1), code: "GAME_NOT_STARTED" },
      { name: "ILLEGAL_MOVE occupied", gameId: turn.gameId, token: turn.token, call: () => playMove(turn.token, 0, 14, next), code: "ILLEGAL_MOVE", extra: { reason: "cell_occupied" } },
      { name: "ILLEGAL_MOVE off the board", gameId: turn.gameId, token: turn.token, call: () => playMove(turn.token, 15, 3, next), code: "ILLEGAL_MOVE", extra: { reason: "out_of_board" } },
      { name: "ILLEGAL_MOVE negative", gameId: turn.gameId, token: turn.token, call: () => playMove(turn.token, 3, -1, next), code: "ILLEGAL_MOVE", extra: { reason: "out_of_board" } },
      { name: "STALE_MOVE", gameId: turn.gameId, token: turn.token, call: () => playMove(turn.token, 1, 1, next + 3), code: "STALE_MOVE" },
      { name: "NOT_YOUR_TURN", gameId: other.gameId, token: other.token, call: () => playMove(other.token, 1, 1, other.agentBlack ? 2 : 3), code: "NOT_YOUR_TURN" },
      { name: "GAME_FINISHED", gameId: finished.gameId, token: finished.token, call: () => playMove(finished.token, 1, 1, 1), code: "GAME_FINISHED" },
      { name: "INVALID_INPUT x", gameId: turn.gameId, token: turn.token, call: () => tool("play_move", { token: turn.token, x: "7", y: 7, moveNumber: next }), code: "INVALID_INPUT" },
      { name: "INVALID_INPUT missing moveNumber", gameId: turn.gameId, token: turn.token, call: () => tool("play_move", { token: turn.token, x: 7, y: 7 }), code: "INVALID_INPUT" },
      { name: "INVALID_INPUT no arguments", gameId: turn.gameId, token: turn.token, call: () => tool("play_move", {}), code: "INVALID_INPUT" },
      { name: "INVALID_INPUT bad token shape", gameId: turn.gameId, token: turn.token, call: () => playMove("short", 7, 7, next), code: "INVALID_INPUT" },
      { name: "INVALID_TOKEN unknown", gameId: turn.gameId, token: turn.token, call: () => playMove("z".repeat(43), 7, 7, next), code: "INVALID_TOKEN" },
    ];

    for (const { name, gameId, token, call, code, extra } of cases) {
      const before = await snapshot(gameId);

      const result = await call();

      const error = errorOf(result);
      expect(error.code, name).toBe(code);
      expect(Object.keys(error).sort(), name).toEqual(["code", "message", ...(extra ? ["reason"] : []), "retryable"].sort());
      expect(error, name).toMatchObject(extra ?? {});
      expect(result.content[0]!.text, name).toBe(error.message);
      // No internals: no SQL, no uuid, no token.
      const text = JSON.stringify(result);
      expect(text, name).not.toMatch(/select |insert |update |[0-9a-f]{8}-[0-9a-f]{4}-/i);
      expect(text, name).not.toContain(token);
      expect(await snapshot(gameId), `${name}: the game is as it was`).toEqual(before);
    }
  });

  it("answer RATE_LIMITED with a wait once the token spent its minute, and change nothing", async () => {
    const game = await startedGame();
    const address = nextAddress();
    const before = await snapshot(game.gameId);

    let limited: ToolResult | undefined;
    for (let i = 0; i < 65 && !limited; i++) {
      const result = await getState(game.token, {}, address);
      if (result.isError) limited = result;
    }

    expect(limited).toBeDefined();
    const error = errorOf(limited!);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
    expect(error.retryAfterMs).toBeGreaterThan(0);
    expect(error.retryAfterMs).toBeLessThanOrEqual(60_000);
    const playBlocked = errorOf(await playMove(game.token, 7, 7, 1, address));
    expect(playBlocked.code).toBe("RATE_LIMITED");
    expect(await snapshot(game.gameId)).toEqual(before);
  });

  it("do not let a token of another game touch this one, and a guessed token is INVALID_TOKEN", async () => {
    const mine = await startedGame();
    const other = await startedGame();
    await untilAgentOnTurn(mine);
    await untilAgentOnTurn(other);
    const number = mine.agentBlack ? 1 : 2;
    const otherBefore = await snapshot(other.gameId);

    const played = await playMove(mine.token, 7, 7, number);

    expect(played.isError).toBeUndefined();
    expect(await snapshot(other.gameId)).toEqual(otherBefore);
    expect((await snapshot(mine.gameId)).move_count).toBe(number);
    // The cookie of the human and a made-up token are not agent tokens.
    for (const token of [mine.cookie.split("=")[1]!.padEnd(43, "x").slice(0, 43), "A".repeat(43)]) {
      expect(errorOf(await getState(token)).code).toBe("INVALID_TOKEN");
      expect(errorOf(await playMove(token, 1, 1, 1)).code).toBe("INVALID_TOKEN");
    }
  });
});

describe("parallel moves and the race for the last move", () => {
  it("leave exactly the state of the one correct move, whatever else arrives with it", async () => {
    const game = await startedGame();
    await untilAgentOnTurn(game);
    const number = game.agentBlack ? 1 : 2;
    const before = await snapshot(game.gameId);

    const results = await Promise.all([
      playMove(game.token, 7, 7, number),
      playMove(game.token, 7, 7, number), // the same move again: a retry, answered with the state
      playMove(game.token, 7, 7, number),
      playMove(game.token, 15, 7, number), // off the board
      playMove(game.token, 3, 3, number + 4), // stale number
      tool("play_move", { token: game.token, x: "a", y: 1, moveNumber: number }),
      playMove("q".repeat(43), 7, 7, number),
      playMove(game.token, 7, 7, number + 1),
    ]);

    const failed = results.filter((result) => result.isError);
    expect(results.filter((result) => !result.isError).length).toBeGreaterThanOrEqual(1);
    for (const result of failed) {
      expect(["ILLEGAL_MOVE", "STALE_MOVE", "INVALID_INPUT", "INVALID_TOKEN", "NOT_YOUR_TURN"]).toContain(
        result.structuredContent.error.code,
      );
    }
    const after = await snapshot(game.gameId);
    expect(after.move_count).toBe(before.move_count + 1);
    expect(after.moves).toBe(`${before.moves}${(7 * 15 + 7).toString(16).padStart(2, "0")}`);
    expect(after.status).toBe("active");
    expect(after.winner_seat).toBeNull();
    const stones = `${after.black}${after.white}`.split("1").length - 1;
    expect(stones).toBe(1);
    // The clock moved exactly once: the human's turn runs now.
    expect((await getState(game.token)).structuredContent).toMatchObject({ turn: "opponent", nextMoveNumber: number + 1 });
  });

  it("let exactly one of the winning move and a resignation of the human happen", async () => {
    const game = await startedGame();
    // The agent is black with four in a row (3..6, 7) and on turn at move 9; the human has (0..3, 0).
    const agent = [3, 4, 5, 6].map((x) => x + 7 * 15);
    const human = [0, 1, 2, 3].map((x) => x);
    const bits = (cells: number[]) => Array.from({ length: 225 }, (_, c) => (cells.includes(c) ? "1" : "0")).join("");
    const moves = agent.flatMap((cell, i) => [cell, human[i]!]);
    await run(
      `update games set black_seat = 2, stones_black = ?::bit(225), stones_white = ?::bit(225), moves = ?::bytea, move_count = 8 where id = ?`,
      [bits(agent), bits(human), Buffer.from(moves), game.gameId],
    );

    const [moved, resigned] = await Promise.all([
      playMove(game.token, 7, 7, 9),
      rest("POST", `/api/games/${game.gameId}/resign`, undefined, game.cookie),
    ]);

    const final = await snapshot(game.gameId);
    expect(final.status).toBe("finished");
    expect(final.winner_seat).toBe(2);
    const moveWon = !moved.isError;
    expect(moveWon).not.toBe(resigned.status === 200);
    expect(final.end_reason).toBe(moveWon ? "five_in_row" : "resignation");
    expect(final.move_count).toBe(moveWon ? 9 : 8);
    if (!moveWon) expect(errorOf(moved).code).toBe("GAME_FINISHED");
  });
});

describe("the clock of the agent", () => {
  const expire = (game: Game, minutes = 11) =>
    run(`update games set turn_started_at = now() - make_interval(mins => ?) where id = ?`, [minutes, game.gameId]);

  it("ends the game with a loss of the agent when its time is up and it never asks (a lost connection)", async () => {
    const game = await startedGame();
    await untilAgentOnTurn(game);
    await expire(game);

    const seenByHuman = await humanState(game);

    expect(seenByHuman).toMatchObject({ status: "finished", result: { reason: "timeout", winnerSeat: 1 } });
    const state = await getState(game.token);
    expect(state.structuredContent).toMatchObject({
      status: "finished",
      turn: null,
      result: { outcome: "loss", reason: "timeout" },
      clock: { youMs: 0 },
    });
    expect(errorOf(await playMove(game.token, 7, 7, game.agentBlack ? 1 : 2)).code).toBe("GAME_FINISHED");
  });

  it("settles a late move as a loss on time: GAME_FINISHED, and the move is not played (the approved exception)", async () => {
    const game = await startedGame();
    await untilAgentOnTurn(game);
    const before = await snapshot(game.gameId);
    await expire(game);

    const late = await playMove(game.token, 7, 7, game.agentBlack ? 1 : 2);

    expect(errorOf(late).code).toBe("GAME_FINISHED");
    const after = await snapshot(game.gameId);
    expect(after).toMatchObject({ status: "finished", end_reason: "timeout", winner_seat: 1 });
    expect(after.move_count).toBe(before.move_count);
    expect(after.moves).toBe(before.moves);
    expect((await getState(game.token)).structuredContent.result).toMatchObject({ outcome: "loss", reason: "timeout" });
  });

  it("makes the agent the winner when the human runs out of time, found by a waiting get_state", async () => {
    const game = await startedGame();
    if (game.agentBlack) {
      expect((await playMove(game.token, 7, 7, 1)).isError).toBeUndefined();
    } else {
      expect((await humanMove(game, 0, 14, 1)).status).toBe(200);
      expect((await playMove(game.token, 7, 7, 2)).isError).toBeUndefined();
    }
    await expire(game);

    const state = await getState(game.token, { waitSeconds: 5 });

    expect(state.structuredContent).toMatchObject({ status: "finished", result: { outcome: "win", reason: "timeout" } });
  });
});

describe("what the agent and the server log never contain", () => {
  it("holds no name, e-mail, id, code or hash of the human, nor the name of the agent, in any answer", async () => {
    const game = await startedGame("leakprobe model");
    await untilAgentOnTurn(game);
    const [agent] = await run(`select agent_token_hash from game_players where game_id = ? and seat = 2`, [game.gameId]);
    const answers: ToolResult[] = [];
    answers.push(await getState(game.token));
    answers.push(await playMove(game.token, 7, 7, game.agentBlack ? 1 : 2));
    answers.push(await playMove(game.token, 7, 7, 1));
    answers.push(await playMove(game.token, 99, 7, 3));
    answers.push(await getState(game.token, { afterMove: 40 }));
    answers.push(await playMove("y".repeat(43), 1, 1, 1));
    await rest("POST", `/api/games/${game.gameId}/resign`, undefined, game.cookie);
    answers.push(await getState(game.token));
    await new Promise((resolve) => setTimeout(resolve, 500));

    const text = JSON.stringify(answers);
    for (const secret of [game.name, game.email, game.userId, game.code, "leakprobe", agent!.agent_token_hash as string]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/displayName|agentName|nickname|chat/);
    const log = readFileSync(SERVER_LOG, "utf8");
    expect(log).not.toContain(game.token);
    expect(log).not.toContain(game.code);
    expect(log).not.toContain("leakprobe");
  });
});
