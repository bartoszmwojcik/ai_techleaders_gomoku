// Starts an ephemeral environment for the integration tests: a PostgreSQL container
// (Testcontainers), the database migrations and the production build of @gomoku/app
// (`next start`) connected to it. Requires Docker and `npm run build`.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

import { Browser } from "./browser";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    browserSession: string;
    databaseUrl: string;
    emailOutboxPath: string;
  }
}

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../..");
const appRoot = resolve(repoRoot, "packages/app");
const nextBin = resolve(repoRoot, "node_modules/next/dist/bin/next");
// Output of `next start`: the first place to look when a test sees a 500 (CI uploads it).
export const SERVER_LOG = resolve(import.meta.dirname, "server.log");
// Outbox of the `file` e-mail transport (git-ignored by `*.email-outbox.jsonl`); tests read links from it.
export const EMAIL_OUTBOX = resolve(import.meta.dirname, "integration.email-outbox.jsonl");
const READY_TIMEOUT_MS = 60_000;

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address ? resolvePort(address.port) : reject(new Error("no port")),
      );
    });
  });
}

async function waitUntilReady(baseUrl: string, server: ChildProcess, output: () => string) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited early:\n${output()}`);
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw new Error(`next start not ready after ${READY_TIMEOUT_MS} ms:\n${output()}`);
}

async function stop(server: ChildProcess) {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((resolveExit) => server.once("exit", resolveExit));
  try {
    // Negative pid: the whole process group, so no worker outlives the run.
    process.kill(-server.pid!, "SIGTERM");
  } catch {
    return; // Already exited.
  }
  await exited;
}

export default async function setup(project: TestProject) {
  if (!existsSync(resolve(appRoot, ".next/BUILD_ID"))) {
    throw new Error("No production build of @gomoku/app — run `npm run build` first.");
  }

  let container: StartedPostgreSqlContainer | undefined;
  let server: ChildProcess | undefined;
  const browser = new Browser(`gomoku-integration-${process.pid}`);

  const teardown = async () => {
    await browser.close().catch(() => {});
    // Stop the app before the database, so it does not log pool errors on the way out.
    if (server) await stop(server);
    await container?.stop();
  };

  try {
    container = await new PostgreSqlContainer("postgres:17").start();
    // Explicit DATABASE_URL: process variables take precedence over the .env* files, so the
    // migrations and the app use the container, never a developer's database.
    const env = { ...process.env, DATABASE_URL: container.getConnectionUri() };

    await execFileAsync("npm", ["run", "db:migration:up"], { cwd: repoRoot, env });

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    rmSync(EMAIL_OUTBOX, { force: true });
    let output = "";
    const log = createWriteStream(SERVER_LOG);
    server = spawn(process.execPath, [nextBin, "start", "--port", String(port)], {
      cwd: appRoot,
      env: {
        ...env,
        NODE_ENV: "production",
        // `next start` is production without HTTPS: plain-HTTP origin, cookie without `Secure`.
        TRUST_PROXY_HOPS: "1",
        APP_ORIGIN: baseUrl,
        SESSION_COOKIE_SECURE: "false",
        // Cheap bcrypt: the limit tests make hundreds of password checks (production is 12).
        PASSWORD_HASH_COST: "4",
        // Confirmation mails go to a file the tests read (no provider needed).
        EMAIL_TRANSPORT: "file",
        EMAIL_OUTBOX_PATH: EMAIL_OUTBOX,
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [server.stdout, server.stderr]) {
      stream?.on("data", (chunk) => {
        output += chunk;
        log.write(chunk);
      });
    }
    await waitUntilReady(baseUrl, server, () => output);

    project.provide("baseUrl", baseUrl);
    project.provide("databaseUrl", container.getConnectionUri());
    project.provide("emailOutboxPath", EMAIL_OUTBOX);
    project.provide("browserSession", browser.session);
  } catch (error) {
    await teardown();
    throw error;
  }

  return teardown;
}
