// The show's drive on the built app and a real PostgreSQL (E14-S02, #282; spec 2026-11-09-show-mode, "Driver"): the
// contract of `PEEK_SQL` with two bots, the pause and `drive.stalled` in SQL; a bot vs bot show of level 1 plays to
// its end driven by reads only, also across a restart of `next start`; the open view in a browser drives it alone;
// without reads the bots stop and the game ends on its clock. The self-play and the restart run on a second
// `next start` of this file (short pauses, its own process to kill), so the shared server of the other files stays up.
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { BotTurnService } from "../../packages/app/src/server/services/games/bot-turn-service";
import { ADMIN_EMAIL, adminCreate } from "./admin";
import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const databaseUrl = inject("databaseUrl");
const ADMIN_PASSWORD = "Admin-naped-789";
const repoRoot = resolve(import.meta.dirname, "../..");
const appRoot = resolve(repoRoot, "packages/app");
const nextBin = resolve(repoRoot, "node_modules/next/dist/bin/next");
// The log of this file's own server (next to server.log of global-setup.ts).
const DRIVE_SERVER_LOG = resolve(import.meta.dirname, "server-drive.log");

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let orm: Orm;
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Json[]>(text, params);

let addressCounter = 0;
const nextAddress = () => `198.53.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
const headers = (base: string, cookie?: string): Record<string, string> => ({
  "content-type": "application/json",
  origin: base,
  "x-gomoku-request": "1",
  "x-forwarded-for": nextAddress(),
  ...(cookie ? { cookie } : {}),
});
const post = (base: string, path: string, body: unknown, cookie?: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: headers(base, cookie), body: JSON.stringify(body) });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function login(email: string, password: string): Promise<string> {
  const response = await post(baseUrl, "/api/auth/login", { email, password });
  expect(response.status).toBe(200);
  return cookieOf(response);
}

async function createShow(base = baseUrl): Promise<string> {
  const response = await post(base, "/api/show", { layout: "bot-bot", levels: [1, 1] }, admin);
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { gameId: string } }).data.gameId;
}

async function readShow(base: string, gameId: string): Promise<Json> {
  const response = await fetch(`${base}/api/show/${gameId}`, { headers: { cookie: admin } });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: Json }).data;
}

/** What the view does, without a browser: reads the show again and again until `done` (or the time runs out). */
async function pollUntil(base: string, gameId: string, done: (state: Json) => boolean, timeoutMs: number, everyMs = 200): Promise<Json> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const state = await readShow(base, gameId);
    if (done(state)) return state;
    if (Date.now() > until) throw new Error(`timed out; last state: ${JSON.stringify({ status: state.status, moveCount: state.moveCount })}`);
    await sleep(everyMs);
  }
}

const movesOf = async (gameId: string) => (await run(`select move_count from games where id = ?`, [gameId]))[0]!.move_count as number;

// ---- A second `next start` of the same build and database, with short pauses (BOT_SHOW_PAUSE_*). ----

async function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? done(address.port) : fail(new Error("no port"))));
    });
  });
}

const log = createWriteStream(DRIVE_SERVER_LOG);
let drivePort = 0;
let driveUrl = "";
let driveServer: ChildProcess | undefined;

async function startDriveServer(): Promise<void> {
  const server = spawn(process.execPath, [nextBin, "start", "--port", String(drivePort)], {
    cwd: appRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
      TRUST_PROXY_HOPS: "1",
      APP_ORIGIN: driveUrl,
      ADMIN_EMAIL,
      SESSION_COOKIE_SECURE: "false",
      PASSWORD_HASH_COST: "4",
      EMAIL_TRANSPORT: "file",
      EMAIL_OUTBOX_PATH: resolve(import.meta.dirname, "drive.email-outbox.jsonl"),
      BOT_ENABLED: "true",
      BOT_FIXED_MEMORY_MB: "768",
      BOT_MAX_ACTIVE_GAMES: "1000",
      SHOW_ENABLED: "true",
      SHOW_BOT_VS_BOT_ENABLED: "true",
      // Short pauses: a game of level 1 to its end in seconds, not minutes.
      BOT_SHOW_PAUSE_MIN_MS: "100",
      BOT_SHOW_PAUSE_MAX_MS: "200",
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (chunk) => log.write(chunk));
  server.stderr?.on("data", (chunk) => log.write(chunk));
  driveServer = server;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("the second next start exited early (see server-drive.log)");
    try {
      await fetch(`${driveUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("the second next start was not ready after 60 s");
}

async function stopDriveServer(): Promise<void> {
  const server = driveServer;
  driveServer = undefined;
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((done) => server.once("exit", done));
  process.kill(-server.pid!, "SIGKILL");
  await exited;
}

let admin = "";

beforeAll(async () => {
  orm = await createOrm({ clientUrl: databaseUrl });
  await run(`delete from users where email = ?`, [ADMIN_EMAIL]);
  await adminCreate(ADMIN_PASSWORD, ["--name", "Szef_Pokazu"]);
  admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  drivePort = await freePort();
  driveUrl = `http://127.0.0.1:${drivePort}`;
});
afterAll(async () => {
  await stopDriveServer();
  await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
  await orm.close();
  log.end();
});
beforeEach(async () => {
  await run(`update games set status = 'cancelled' where origin = 'show' and status in ('waiting', 'active')`);
  await run(`delete from rate_limit_buckets where "key" like 'show-create:%'`);
});

describe("PEEK_SQL with two bots, on PostgreSQL (show-mode \"Driver\", step 1)", () => {
  // The real query and selection; the engine and the write are stand-ins, so the rows decide alone.
  function service() {
    const played: string[] = [];
    const turns: Json[] = [];
    const bots = new BotTurnService({
      em: orm.em.fork(),
      clock: { now: () => new Date() },
      botEngine: { choose: async (turn) => (turns.push(turn), 0) },
      gameMoveService: { play: async ({ playerId }: { playerId: string }) => void played.push(playerId) } as never,
      serverConfig: { show: { enabled: true, botVsBotEnabled: true, botLevel2Enabled: false, pauseMinMs: 1000, pauseMaxMs: 2000 } },
    });
    return { bots, played, turns };
  }
  const seatIds = async (gameId: string) =>
    Object.fromEntries((await run(`select seat, id from game_players where game_id = ?`, [gameId])).map((row) => [row.seat, row.id]));

  it("picks the bot on turn for both colours and both turns, after the pause counted from the start of the turn", async () => {
    const gameId = await createShow();
    const ids = await seatIds(gameId);
    // [black seat, moves played, the seat on turn]
    for (const [blackSeat, moveCount, onTurn] of [
      [1, 0, 1],
      [1, 1, 2],
      [2, 0, 2],
      [2, 1, 1],
    ] as const) {
      // A board the CHECKs accept: no stone, or black's first stone in the centre (cell 112).
      const board = moveCount === 0 ? "repeat('0', 225)" : "repeat('0', 112) || '1' || repeat('0', 112)";
      await run(
        `update games set black_seat = ?, move_count = ?, moves = ?, stones_black = (${board})::bit(225),
           turn_started_at = now() - interval '3 seconds' where id = ?`,
        [blackSeat, moveCount, Buffer.from(moveCount === 0 ? [] : [112]), gameId],
      );
      const { bots, played, turns } = service();
      expect(await bots.playDueMove(gameId), `black ${blackSeat}, moves ${moveCount}`).toBe("played");
      expect(played).toEqual([ids[onTurn]]);
      expect(turns[0]).toMatchObject({ gameId, moveNumber: moveCount + 1, level: 1 });
      // The clock of the bot on turn, read in the same query (R6).
      expect(turns[0]!.remainingClockMs).toBeGreaterThan(590_000);
    }
  });

  it("waits within the pause, and does nothing before the clock starts or without a bot", async () => {
    const gameId = await createShow();
    await run(`update games set turn_started_at = now() - interval '200 milliseconds' where id = ?`, [gameId]);
    expect(await service().bots.playDueMove(gameId)).toBe("idle");

    await run(`update games set turn_started_at = null where id = ?`, [gameId]);
    expect(await service().bots.playDueMove(gameId)).toBe("idle");

    const player = await post(baseUrl, "/api/auth/register", {
      email: `naped-${Date.now().toString(36)}@example.com`,
      displayName: `Naped_${Date.now().toString(36)}`.slice(0, 24),
      password: "secret123",
    });
    const created = await post(baseUrl, "/api/games", {}, cookieOf(player));
    const { gameId: plain } = ((await created.json()) as { data: { gameId: string } }).data;
    expect(await service().bots.playDueMove(plain)).toBe("idle");
  });
});

describe("drive.stalled in SQL (step 3)", () => {
  it("is false at the start of the bot's turn and true once it has been on turn longer than pause, ceiling and 5 s", async () => {
    const gameId = await createShow();
    expect((await readShow(baseUrl, gameId)).drive).toEqual({ botOnTurn: true, stalled: false });

    // 2000 (longest pause) + 250 (ceiling of level 1) + 5000 = 7250 ms; 8 s is past it. The read answers before the
    // move it schedules lands, so this answer still says "stalled".
    await run(`update games set turn_started_at = now() - interval '8 seconds' where id = ?`, [gameId]);
    expect((await readShow(baseUrl, gameId)).drive).toEqual({ botOnTurn: true, stalled: true });
  });
});

describe("the drive on the shared server (default pause 1-2 s)", () => {
  it("plays a bot's move after its pause, only while the show is read, and the game ends on its clock without reads", async () => {
    const gameId = await createShow();
    const startedAt = Date.now();
    const first = await pollUntil(baseUrl, gameId, (state) => state.moveCount >= 1, 15_000, 150);
    // The pause (P9): no move earlier than 1 s after the start of the turn.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_000);
    expect(first.moves).toHaveLength(1);

    // No reads: the move a last read may have scheduled lands, then nothing more (the closed tab, negative).
    await sleep(3_000);
    const settled = await movesOf(gameId);
    expect(settled).toBeLessThanOrEqual(first.moveCount + 1);
    await sleep(3_000);
    expect(await movesOf(gameId)).toBe(settled);

    // The clock keeps running: with the bot's clock almost out, the next read finishes the game on time.
    await run(
      `update games set clock_ms_1 = 500, clock_ms_2 = 500, turn_started_at = now() - interval '1 second' where id = ?`,
      [gameId],
    );
    const over = await readShow(baseUrl, gameId);
    expect(over.status).toBe("finished");
    expect(over.result.reason).toBe("timeout");
    expect(over.drive).toEqual({ botOnTurn: false, stalled: false });
  });

  it("is driven by the administrator's open view alone, in a browser", async () => {
    const browser = new Browser(`${inject("browserSession")}-drive`);
    try {
      await browser.open(`${baseUrl}/`);
      await browser.setCookie(admin.slice(0, admin.indexOf("=")), admin.slice(admin.indexOf("=") + 1), baseUrl);
      const gameId = await createShow();
      await browser.open(`${baseUrl}/show/${gameId}`);
      await browser.waitFor('[data-testid="show-drive"][data-state="running"]');
      expect(await browser.text('[data-testid="show-drive"]')).toBe("Napęd działa");
      // Nothing but the page reads the show: the stones come from its polling.
      await browser.waitForFn(`document.querySelectorAll('[aria-label*="kamień"]').length >= 3`);
      expect(await movesOf(gameId)).toBeGreaterThanOrEqual(3);
    } finally {
      await browser.close();
    }
  }, 60_000);
});

describe("a bot vs bot show of level 1 to its end, across a restart (step 5)", () => {
  it("plays to the end driven by reads only, with both bots, and resumes after next start is killed and started again", async () => {
    await startDriveServer();
    const gameId = await createShow(driveUrl);

    const before = await pollUntil(driveUrl, gameId, (state) => state.moveCount >= 6, 30_000);
    // Killed mid-show (a computation in flight is lost), started again on the same port: the next read resumes it.
    await stopDriveServer();
    const atRestart = await movesOf(gameId);
    expect(atRestart).toBeGreaterThanOrEqual(before.moveCount);
    await startDriveServer();

    const end = await pollUntil(driveUrl, gameId, (state) => state.status !== "active", 150_000);
    expect(end.status).toBe("finished");
    expect(end.moveCount).toBeGreaterThan(atRestart);
    expect(["five_in_row", "draw"]).toContain(end.result.reason);

    // Every move is a distinct cell, the whole game is there, and nobody is on turn any more.
    const full = await readShow(driveUrl, gameId);
    expect(full.moves).toHaveLength(end.moveCount);
    expect(new Set(full.moves).size).toBe(end.moveCount);
    expect(full.drive).toEqual({ botOnTurn: false, stalled: false });
  }, 240_000);
});
