// The bot's resources (hosted-bot spec, E13-S04) against the built app and a real PostgreSQL: the move is
// computed in a worker thread (the server keeps answering meanwhile), two games compute one after the
// other (the gate), two routes reading at once compute one move (`globalThis`), the limit of games with the
// bot counts on the database, and the main thread's event-loop delay stays within R18 (`bot:bench`).
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { cellOf } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { ServerConfig } from "../../packages/app/src/server/config";
import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { BotAdmission } from "../../packages/app/src/server/services/games/bot-admission";
import { createResourceProbe } from "../../packages/app/src/server/services/games/resource-probe";

const baseUrl = inject("baseUrl");
const repoRoot = resolve(import.meta.dirname, "../..");
// The log of the server started by global-setup.ts (its SERVER_LOG).
const SERVER_LOG = resolve(import.meta.dirname, "server.log");

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let addressCounter = 0;
const nextAddress = () => `198.42.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

function call(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: baseUrl,
    "x-gomoku-request": "1",
    "x-forwarded-for": nextAddress(),
  };
  if (cookie) headers.cookie = cookie;
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `worker-${n}@example.com`,
    displayName: `Worker_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function state(gameId: string, cookie: string): Promise<Json> {
  const response = await call("GET", `/api/games/${gameId}`, undefined, cookie);
  expect(response.status).toBe(200);
  return (await json(response)).data;
}

async function readUntil(gameId: string, cookie: string, done: (data: Json) => boolean, timeoutMs = 20_000): Promise<Json> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const data = await state(gameId, cookie);
    if (done(data)) return data;
    if (Date.now() > until) throw new Error(`timed out; last state: ${JSON.stringify({ moveCount: data.moveCount, turnSeat: data.turnSeat, status: data.status })}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Far apart, so the player never builds a line by accident and the bot's search has a real position.
const PLAYER_CELLS = [
  [2, 2], [12, 2], [2, 12], [12, 12], [7, 2], [2, 7], [12, 7], [7, 12], [4, 9], [10, 4],
].map(([x, y]) => ({ x: x!, y: y! }));
const playerCell = (moves: number[]) => PLAYER_CELLS.find(({ x, y }) => !moves.includes(cellOf(x, y)))!;

/** A level-2 game where the player is to move after `rounds` moves of each side. */
async function levelTwoGame(cookie: string, rounds: number): Promise<{ gameId: string; data: Json }> {
  const created = await call("POST", "/api/games", { opponent: "bot", botLevel: 2 }, cookie);
  expect(created.status).toBe(201);
  const { gameId } = (await json(created)).data as { gameId: string };
  let data = await readUntil(gameId, cookie, (d) => d.turnSeat === 1);
  for (let round = 0; round < rounds; round++) {
    const moved = await call("POST", `/api/games/${gameId}/moves`, { ...playerCell(data.moves), moveNumber: data.moveCount + 1 }, cookie);
    expect(moved.status).toBe(200);
    const before = data.moveCount as number;
    data = await readUntil(gameId, cookie, (d) => d.moveCount === before + 2 && d.turnSeat === 1);
  }
  return { gameId, data };
}

type BotLine = { event: string; gameId: string; moveNumber: number; level: number; depth: number; ms: number; ts: string };

/** The bot's log lines of a game in the server's log (one JSON object per line). */
function botLines(gameId: string): BotLine[] {
  return readFileSync(SERVER_LOG, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("{") && line.includes(gameId))
    .map((line) => JSON.parse(line) as BotLine)
    .filter((line) => line.event.startsWith("bot"));
}

describe("the bot computes in a worker thread (R5, A-22)", () => {
  it("answers other requests while the level-2 search runs, and logs the move without the position", async () => {
    const cookie = await signedUp();
    const { gameId, data } = await levelTwoGame(cookie, 4);

    const latencies: number[] = [];
    let probing = true;
    const probe = (async () => {
      while (probing) {
        const start = performance.now();
        await (await fetch(`${baseUrl}/favicon.ico`)).arrayBuffer();
        latencies.push(performance.now() - start);
        await new Promise((r) => setTimeout(r, 20));
      }
    })();
    const moved = await call("POST", `/api/games/${gameId}/moves`, { ...playerCell(data.moves), moveNumber: data.moveCount + 1 }, cookie);
    expect(moved.status).toBe(200);
    await readUntil(gameId, cookie, (d) => d.moveCount === data.moveCount + 2 || d.status === "finished");
    probing = false;
    await probe;

    const [move] = botLines(gameId).filter((line) => line.moveNumber === data.moveCount + 2);
    expect(move).toMatchObject({ event: "bot_move", level: 2 });
    expect(move!.depth).toBeGreaterThan(0);
    expect(botLines(gameId).some((line) => line.event === "bot_engine_error")).toBe(false);
    // On the main thread the search would hold every request for the whole move (hundreds of ms up to
    // the soft target of 1.5 s). The HTTP round trip also carries the network and GC noise of a CI
    // runner, so the bound here is loose; the event-loop delay itself (R18: p99 <= 50 ms) is measured
    // in-process by `bot:bench` below.
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1]!;
    console.info(JSON.stringify({ botMoveMs: move!.ms, depth: move!.depth, probes: latencies.length, p95, max: latencies.at(-1) }));
    expect(latencies.length).toBeGreaterThan(1);
    expect(p95).toBeLessThan(Math.max(250, move!.ms / 2));
  });

  it("computes two games one after the other: the gate lets one search run at a time (R8)", async () => {
    const [first, second] = await Promise.all([signedUp(), signedUp()]);
    const games = await Promise.all([levelTwoGame(first, 2), levelTwoGame(second, 2)]);
    await Promise.all(
      games.map(({ gameId, data }, index) =>
        call("POST", `/api/games/${gameId}/moves`, { ...playerCell(data.moves), moveNumber: data.moveCount + 1 }, [first, second][index]),
      ),
    );
    await Promise.all(games.map(({ gameId, data }, index) => readUntil(gameId, [first, second][index]!, (d) => d.moveCount === data.moveCount + 2)));

    const spans = games.map(({ gameId, data }) => {
      const line = botLines(gameId).find((l) => l.event === "bot_move" && l.moveNumber === data.moveCount + 2)!;
      const end = Date.parse(line.ts);
      return { start: end - line.ms, end };
    });
    spans.sort((a, b) => a.start - b.start);
    // The second search starts after the first ended (a few ms of rounding in `ms` and `ts`).
    expect(spans[1]!.start).toBeGreaterThanOrEqual(spans[0]!.end - 5);
  });

  it("computes one move when two routes read the game at once (globalThis, hosted-bot Risks)", async () => {
    const cookie = await signedUp();
    const { gameId, data } = await levelTwoGame(cookie, 3);
    // The move's route schedules the bot after its answer; the state route reads meanwhile and would too.
    const moved = await call("POST", `/api/games/${gameId}/moves`, { ...playerCell(data.moves), moveNumber: data.moveCount + 1 }, cookie);
    expect(moved.status).toBe(200);
    await Promise.all([state(gameId, cookie), state(gameId, cookie), state(gameId, cookie)]);
    await readUntil(gameId, cookie, (d) => d.moveCount === data.moveCount + 2);
    const computed = botLines(gameId).filter((line) => line.event === "bot_move" && line.moveNumber === data.moveCount + 2);
    expect(computed).toHaveLength(1);
  });
});

describe("the limit of games with the bot on PostgreSQL (R8)", () => {
  const admission = (maxActiveGames: number) =>
    new BotAdmission({
      em: orm.em.fork(),
      serverConfig: { botEnabled: true, bot: { maxActiveGames, minAvailableMb: 256 } } as ServerConfig,
      resourceProbe: createResourceProbe({ fixedMb: 768 }),
      clock: systemClock,
    });
  /** The number of active games with the bot as the admission counts them: the lowest limit it still admits under. */
  async function counted(): Promise<number> {
    for (let limit = 1; ; limit++) {
      if (await admission(limit).admit(2).then(() => true, () => false)) return limit - 1;
    }
  }

  it("counts active games with the bot whose clock runs, not abandoned ones, and refuses at the limit", async () => {
    const cookie = await signedUp();
    const created = await call("POST", "/api/games", { opponent: "bot", botLevel: 1 }, cookie);
    const { gameId } = (await json(created)).data as { gameId: string };
    const active = await counted();
    expect(active).toBeGreaterThanOrEqual(1);
    const refused = await admission(active).admit(1).catch((error: unknown) => error);
    expect(refused).toMatchObject({ status: 503, code: "BOT_UNAVAILABLE", retryAfterSeconds: 60 });

    // Abandoned: the clock ran out long ago, nobody has settled the game yet.
    await run(`update games set turn_started_at = now() - interval '11 minutes', black_seat = 1 where id = ?`, [gameId]);
    expect(await counted()).toBe(active - 1);
  });

  it("refuses below the minimum of available memory without counting", async () => {
    const probe = createResourceProbe({ fixedMb: 100 });
    const refused = await new BotAdmission({
      em: orm.em.fork(),
      serverConfig: { botEnabled: true, bot: { maxActiveGames: 1000, minAvailableMb: 256 } } as ServerConfig,
      resourceProbe: probe,
      clock: systemClock,
    })
      .admit(2)
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({ status: 503, code: "BOT_UNAVAILABLE" });
  });
});

describe("bot:bench in-process measurement (R18, spec section 5)", () => {
  it("keeps the main thread's event-loop delay under 50 ms (p99) while real worker threads search", async () => {
    const { stdout } = await promisify(execFile)("npm", ["run", "-s", "bot:bench", "--", "--positions", "3", "--memory-mb", "768"], {
      cwd: repoRoot,
      timeout: 120_000,
    }).catch((error: { stdout: string }) => error);
    const result = JSON.parse(stdout) as Json;
    console.info(JSON.stringify({ eventLoopDelayMs: result.eventLoopDelayMs, moveMs: result.moveMs, depth: result.depth }));
    expect(result.moves).toBe(3);
    expect(result.problems).toBe(0);
    expect(result.eventLoopDelayMs.p99).toBeLessThanOrEqual(50);
  }, 150_000);
});
