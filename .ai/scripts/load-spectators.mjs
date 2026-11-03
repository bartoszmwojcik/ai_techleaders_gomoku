#!/usr/bin/env node
// Load measurement for live spectating (E10-S02-T01, #206; Q-17, A-14).
//
// Two accounts play a game over HTTP against a RUNNING production build (`next start`) while
// N "spectators" refresh the state; per scenario it reports the move latency, how late a
// spectator sees a move, the server's RSS and CPU. Run it through load-spectators.sh, which
// brings up PostgreSQL + the build and passes BASE_URL / SERVER_PID.
//
// No spectator endpoint exists yet (that is E10-S02), so a spectator is emulated by the read it
// will need anyway: `GET /api/games/:id?after=<moveCount>` with a player's session. That is the
// same state query the players' own poll runs (an upper-bound proxy: the real spectator read
// resolves a viewer instead of a participant, so it costs about the same).
//
// Usage: BASE_URL=http://127.0.0.1:3100 SERVER_PID=1234 node load-spectators.mjs [options]
//   --scenarios=0@0,20@5000,20@2000   spectators@pollIntervalMs, comma separated
//   --moves=40          moves played per scenario        --pace=1500   ms between moves
//   --warmup=0          skip the unreported warm-up game
//   --sse-reference     also measure a bare Node SSE fan-out (transport lower bound, NOT Next)
//   --json              machine-readable output
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const SERVER_PID = Number(process.env.SERVER_PID ?? 0);
const MOVES = Number(args.moves ?? 40);
const PACE = Number(args.pace ?? 1500);
const PLAYER_POLL = 2000; // PLAY_POLL_INTERVAL_MS in game-room.tsx
const scenarios = (args.scenarios ?? "0@0,20@5000,20@3000,20@2000,20@1000,40@2000").split(",").map((s) => {
  const [n, ms] = s.split("@").map(Number);
  return { spectators: n, interval: ms };
});

// ------------------------------------------------------------------ process metrics (/proc)
function tree(pid) {
  const pids = [pid];
  for (let i = 0; i < pids.length; i++) {
    try {
      for (const t of readdirSync(`/proc/${pids[i]}/task`)) {
        const kids = readFileSync(`/proc/${pids[i]}/task/${t}/children`, "utf8").trim();
        if (kids) pids.push(...kids.split(/\s+/).map(Number));
      }
    } catch {
      /* process gone */
    }
  }
  return [...new Set(pids)];
}
const rssMb = (pid) =>
  tree(pid).reduce((sum, p) => {
    try {
      return sum + Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${p}/status`, "utf8"))?.[1] ?? 0) / 1024;
    } catch {
      return sum;
    }
  }, 0);
const cpuSeconds = (pid) =>
  tree(pid).reduce((sum, p) => {
    try {
      const f = readFileSync(`/proc/${p}/stat`, "utf8").replace(/^.*\) /, "").split(" ");
      return sum + (Number(f[11]) + Number(f[12])) / 100; // utime + stime, 100 ticks/s
    } catch {
      return sum;
    }
  }, 0);

// ------------------------------------------------------------------ http helpers
let ip = 0;
const nextIp = () => `198.18.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;
const addr = nextIp; // each simulated client has its own address (TRUST_PROXY_HOPS=1)
async function call(method, path, body, cookie, address = addr()) {
  const t0 = performance.now();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: BASE,
      "x-gomoku-request": "1",
      "x-forwarded-for": address,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json, ms: performance.now() - t0, response };
}
const cookieOf = (r) => (r.headers.get("set-cookie") ?? "").split(";")[0];
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : NaN);
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : "-");

async function register(label) {
  const n = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const r = await call("POST", "/api/auth/register", {
    email: `load-${label}-${n}@example.com`,
    displayName: `Load_${label}_${n}`.slice(0, 24),
    password: "secret123",
  });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.json)}`);
  return cookieOf(r.response);
}

// A legal stream of non-winning moves: random free cells, skipping any that would make five.
function moveStream(count) {
  const board = new Map();
  const makesFive = (x, y, c) =>
    [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dx, dy]) => {
      let n = 1;
      for (const s of [1, -1]) for (let k = 1; board.get(`${x + s * k * dx},${y + s * k * dy}`) === c; k++) n++;
      return n >= 5;
    });
  const out = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  while (out.length < count) {
    const c = out.length % 2;
    const x = Math.floor(rnd() * 15), y = Math.floor(rnd() * 15);
    if (board.has(`${x},${y}`) || makesFive(x, y, c)) continue;
    board.set(`${x},${y}`, c);
    out.push([x, y]);
  }
  return out;
}

async function startGame() {
  const alice = await register("a");
  const bob = await register("b");
  const created = await call("POST", "/api/games", {}, alice);
  const { gameId, invitation } = created.json.data;
  const joined = await call("POST", `/api/invitations/${invitation.code}/accept`, { as: "user" }, bob);
  if (joined.status !== 200) throw new Error(`accept failed: ${joined.status}`);
  const state = (await call("GET", `/api/games/${gameId}`, undefined, alice)).json.data; // starts the clock
  await call("GET", `/api/games/${gameId}`, undefined, bob);
  const aliceIsBlack = state.blackSeat === state.you.seat;
  return { gameId, black: aliceIsBlack ? alice : bob, white: aliceIsBlack ? bob : alice };
}

// ------------------------------------------------------------------ one scenario
async function runScenario({ spectators, interval }, moves = MOVES) {
  const game = await startGame();
  const stream = moveStream(moves);
  const acked = []; // performance.now() when move n was acknowledged
  const seenLag = []; // spectator: ms between the ack of move n and the poll that saw it
  const statuses = {};
  const count = (s) => (statuses[s] = (statuses[s] ?? 0) + 1);
  const specGet = [], playerGet = [], movePost = [];
  let running = true, specRequests = 0, playerRequests = 0;

  const rss0 = rssMb(SERVER_PID), cpu0 = cpuSeconds(SERVER_PID);
  let rssMax = rss0, rssSum = 0, rssN = 0;
  const sampler = setInterval(() => {
    const m = rssMb(SERVER_PID);
    rssMax = Math.max(rssMax, m); rssSum += m; rssN++;
  }, 250);

  // Spectator: polls with its own address and `?after=`, like game-room.tsx would.
  const spectate = async (cookie, jitter) => {
    await sleep(jitter);
    let known = 0;
    while (running) {
      const r = await call("GET", `/api/games/${game.gameId}?after=${known}`, undefined, cookie, nextIp());
      specRequests++; count(r.status); specGet.push(r.ms);
      if (r.status === 200) {
        const seen = r.json.data.moveCount;
        const now = performance.now();
        for (let n = known + 1; n <= seen; n++) if (acked[n - 1] !== undefined) seenLag.push(now - acked[n - 1]);
        known = seen;
      }
      await sleep(interval);
    }
  };
  // Players poll their game at 2 s as the real client does (the opponent's move arrives this way).
  const playerPoll = async (cookie) => {
    await sleep(Math.random() * PLAYER_POLL);
    while (running) {
      const r = await call("GET", `/api/games/${game.gameId}`, undefined, cookie, nextIp());
      playerRequests++; playerGet.push(r.ms);
      await sleep(PLAYER_POLL);
    }
  };

  const cookies = [game.black, game.white];
  const tasks = [playerPoll(game.black), playerPoll(game.white)];
  for (let i = 0; i < spectators; i++) tasks.push(spectate(cookies[i % 2], Math.random() * interval));
  await sleep(1500); // let the pollers settle

  const t0 = performance.now();
  for (const [i, [x, y]] of stream.entries()) {
    const r = await call("POST", `/api/games/${game.gameId}/moves`, { x, y, moveNumber: i + 1 }, cookies[i % 2]);
    if (r.status !== 200) throw new Error(`move ${i + 1}: ${r.status} ${JSON.stringify(r.json?.error)}`);
    acked[i] = performance.now();
    movePost.push(r.ms);
    await sleep(PACE);
  }
  await sleep(Math.max(interval, PLAYER_POLL) + 500); // the last move reaches every poller
  running = false;
  const wall = (performance.now() - t0) / 1000;
  clearInterval(sampler);
  await Promise.all(tasks);

  return {
    spectators, intervalMs: interval, moves,
    movePostMs: { p50: pct(movePost, 50), p95: pct(movePost, 95), max: Math.max(...movePost) },
    playerGetMs: { p50: pct(playerGet, 50), p95: pct(playerGet, 95), max: Math.max(...playerGet) },
    spectatorGetMs: { p50: pct(specGet, 50), p95: pct(specGet, 95), max: specGet.length ? Math.max(...specGet) : NaN },
    spectatorSeesMoveAfterMs: { p50: pct(seenLag, 50), p95: pct(seenLag, 95), max: seenLag.length ? Math.max(...seenLag) : NaN },
    requests: { spectators: specRequests, players: playerRequests, statuses },
    requestsPerSecond: (specRequests + playerRequests) / wall,
    serverRssMb: { before: rss0, avg: rssSum / Math.max(rssN, 1), max: rssMax },
    serverCpuPercentOfOneCore: ((cpuSeconds(SERVER_PID) - cpu0) / wall) * 100,
    cpuMsPerRequest: ((cpuSeconds(SERVER_PID) - cpu0) * 1000) / Math.max(specRequests + playerRequests, 1),
  };
}

// ------------------------------------------------------------------ SSE reference (bare Node, not Next)
const SSE_SERVER = `
const http = require("node:http");
const clients = new Set();
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  res.write(": open\\n\\n");
  clients.add(res); req.on("close", () => clients.delete(res));
});
server.listen(0, "127.0.0.1", () => console.log("PORT " + server.address().port));
process.stdin.on("data", (d) => { for (const res of clients) res.write("data: " + String(d).trim() + "\\n\\n"); });
`;
async function sseReference(spectators) {
  const child = spawn(process.execPath, ["-e", SSE_SERVER], { stdio: ["pipe", "pipe", "inherit"] });
  const port = await new Promise((resolve) => child.stdout.once("data", (d) => resolve(Number(/PORT (\d+)/.exec(String(d))[1]))));
  const rss0 = rssMb(child.pid);
  const lags = [];
  let sent = 0;
  const sentAt = new Map();
  const reqs = [];
  for (let i = 0; i < spectators; i++) {
    reqs.push(
      new Promise((resolve) => {
        const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
          res.on("data", (d) => {
            for (const m of String(d).matchAll(/data: (\d+)/g)) lags.push(performance.now() - sentAt.get(Number(m[1])));
          });
          resolve(req);
        });
      }),
    );
  }
  const open = await Promise.all(reqs);
  await sleep(300);
  const rssOpen = rssMb(child.pid);
  for (let n = 1; n <= MOVES; n++) {
    sentAt.set(n, performance.now()); child.stdin.write(`${n}\n`); sent++;
    await sleep(Math.min(PACE, 200)); // pacing is irrelevant for the fan-out cost
  }
  await sleep(300);
  const rssEnd = rssMb(child.pid);
  for (const r of open) r.destroy();
  child.kill();
  return {
    spectators, messages: sent, delivered: lags.length,
    seesMoveAfterMs: { p50: pct(lags, 50), p95: pct(lags, 95), max: Math.max(...lags) },
    rssMb: { empty: rss0, withConnections: rssOpen, afterMessages: rssEnd },
    perConnectionKb: ((rssOpen - rss0) * 1024) / spectators,
  };
}

// ------------------------------------------------------------------ main
if (!SERVER_PID && !args["sse-reference"]) throw new Error("SERVER_PID is required (process of `next start`)");
const results = [];
if (!args["sse-reference"] && args.warmup !== "0") {
  process.stderr.write("warm-up (not reported) ...\n"); // JIT and cold caches would distort the first scenario
  await runScenario({ spectators: 2, interval: 1000 }, 12);
}
for (const s of args["sse-reference"] ? [] : scenarios) {
  process.stderr.write(`scenario ${s.spectators} spectators @ ${s.interval} ms ...\n`);
  results.push(await runScenario(s));
}
const sse = args["sse-reference"] ? await sseReference(20) : undefined;

if (args.json) {
  console.log(JSON.stringify({ results, sse }, null, 2));
} else {
  console.log("spect | poll ms | POST p50/p95/max | sees move p50/p95 | spec GET p50/p95 | req/s | RSS avg/max MB | CPU %1core | cpu ms/req");
  for (const r of results) {
    console.log(
      [
        String(r.spectators).padStart(5), String(r.intervalMs).padStart(7),
        `${fmt(r.movePostMs.p50)}/${fmt(r.movePostMs.p95)}/${fmt(r.movePostMs.max)}`,
        `${fmt(r.spectatorSeesMoveAfterMs.p50)}/${fmt(r.spectatorSeesMoveAfterMs.p95)}`,
        `${fmt(r.spectatorGetMs.p50)}/${fmt(r.spectatorGetMs.p95)}`,
        fmt(r.requestsPerSecond),
        `${fmt(r.serverRssMb.avg)}/${fmt(r.serverRssMb.max)}`,
        fmt(r.serverCpuPercentOfOneCore), r.cpuMsPerRequest.toFixed(2),
        Object.entries(r.requests.statuses).map(([k, v]) => `${k}x${v}`).join(","),
      ].join(" | "),
    );
  }
  if (sse) console.log("SSE reference (bare Node, not Next):", JSON.stringify(sse));
}
