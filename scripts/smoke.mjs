// Smoke test of the production build: starts `next start` for @gomoku/app, checks the key
// routes and the database connection, then stops the server. Run `npm run build` first.
//
// Usage: npm run smoke            (port from SMOKE_PORT, default 3100)
import { spawn } from "node:child_process";

const port = Number(process.env.SMOKE_PORT ?? 3100);
const baseUrl = `http://127.0.0.1:${port}`;
const READY_TIMEOUT_MS = 30_000;

const checks = [
  { path: "/", status: 200, contains: "Gomoku" },
  { path: "/backend", status: 200, contains: "Panel administracyjny" },
  { path: "/api/health", status: 200, json: (body) => body.status === "ok" },
  { path: "/this-route-does-not-exist", status: 404 },
];

// Refuse a busy port: our server would fail to bind and the checks would hit someone else's.
try {
  await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
  console.error(`✗ port ${port} is already in use — stop that server or set SMOKE_PORT`);
  process.exit(1);
} catch {
  // Nothing listening: good.
}

// Own process group, so the whole tree (npm → next → next-server) can be stopped at once.
const server = spawn("npm", ["run", "start", "-w", "@gomoku/app", "--", "--port", String(port)], {
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => (serverOutput += chunk));
server.stderr.on("data", (chunk) => (serverOutput += chunk));

function stopServer() {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // Already exited.
  }
}
process.on("exit", stopServer);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => process.exit(130));
}

async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited early:\n${serverOutput}`);
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`server not ready after ${READY_TIMEOUT_MS} ms:\n${serverOutput}`);
}

async function runCheck({ path, status, contains, json }) {
  const response = await fetch(baseUrl + path, { signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  const problems = [];
  if (response.status !== status) problems.push(`status ${response.status}, expected ${status}`);
  if (contains && !text.includes(contains)) problems.push(`body does not contain "${contains}"`);
  if (json) {
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (!body || !json(body)) problems.push(`unexpected body: ${text.slice(0, 200)}`);
  }
  return problems;
}

let failed = false;
try {
  await waitUntilReady();
  for (const check of checks) {
    const problems = await runCheck(check);
    failed ||= problems.length > 0;
    console.log(`${problems.length ? "✗" : "✓"} GET ${check.path}${problems.length ? ` — ${problems.join("; ")}` : ""}`);
  }
  if (failed) {
    console.error("\nSmoke test failed. If /api/health failed, check DATABASE_URL and that PostgreSQL is running.");
  }
} catch (error) {
  failed = true;
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
}
process.exit(failed ? 1 : 0);
