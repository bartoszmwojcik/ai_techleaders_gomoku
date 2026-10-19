// Side-effecting adapters used by the installer. Everything here is injected into the
// steps (see `defaultDeps`), so unit tests replace it with fakes and never run npm,
// Docker or touch the network. Only Node built-ins: the installer runs before `npm ci`.
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

/**
 * @typedef {object} RunOptions
 * @property {string} [cwd]
 * @property {NodeJS.ProcessEnv} [env]
 * @property {number} timeoutMs Hard limit; the process is killed when it is exceeded.
 * @property {NodeJS.Platform} [platform]
 */

/**
 * @typedef {object} RunResult
 * @property {number | null} code Exit code; `null` when the process timed out or did not start.
 * @property {string} stdout
 * @property {string} stderr
 * @property {boolean} timedOut
 * @property {string} [error] Spawn error code, e.g. `ENOENT` when the command is not installed.
 */

/** Grace period between SIGTERM and SIGKILL for a timed-out command (POSIX). */
export const KILL_GRACE_MS = 2_000;

/**
 * Runs a command with fixed arguments and collects its output.
 *
 * On Windows `npm`, `npx` and `docker` are shims that need a shell; the command is
 * then passed as a single string (passing an argument array together with
 * `shell: true` is deprecated, DEP0190). Arguments are constants defined by the
 * installer, never user input, and secrets travel only through `env`.
 *
 * The timeout is a hard limit: the result resolves as soon as it fires, without
 * waiting for `close` — a grandchild that keeps the pipes open must not hang the
 * installer. The process tree is then terminated (Windows: `taskkill /T /F`; POSIX:
 * SIGTERM, which npm forwards to its children, then SIGKILL after a grace period).
 *
 * @param {string} command
 * @param {string[]} args
 * @param {RunOptions} options
 * @returns {Promise<RunResult>}
 */
export function run(command, args, { cwd, env, timeoutMs, platform = process.platform }) {
  return new Promise((resolveRun) => {
    const child =
      platform === "win32"
        ? spawn([command, ...args].join(" "), { cwd, env, shell: true })
        : spawn(command, args, { cwd, env });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (/** @type {RunResult} */ result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun(result);
    };
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      terminate(child, platform);
      child.stdout?.destroy();
      child.stderr?.destroy();
      finish({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);
    child.on("error", (/** @type {NodeJS.ErrnoException} */ error) =>
      finish({ code: null, stdout, stderr, timedOut: false, error: error.code ?? error.message }),
    );
    child.on("close", (code) => finish({ code, stdout, stderr, timedOut: false }));
  });
}

/**
 * @param {import("node:child_process").ChildProcess} child
 * @param {NodeJS.Platform} platform
 */
function terminate(child, platform) {
  if (platform === "win32") {
    // `kill()` would stop only cmd.exe; taskkill /T takes npm, node and docker with it.
    if (child.pid !== undefined) spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => {});
    return;
  }
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, KILL_GRACE_MS).unref();
}

/**
 * Checks whether something accepts TCP connections on the local port, on IPv4 or IPv6
 * (`localhost` may resolve to either, and a server may listen on only one of them).
 *
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export async function isPortInUse(port, timeoutMs = 1_000) {
  const results = await Promise.all(["127.0.0.1", "::1"].map((host) => canConnect(host, port, timeoutMs)));
  return results.includes(true);
}

/**
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function canConnect(host, port, timeoutMs) {
  return new Promise((resolveConnect) => {
    const socket = createConnection({ host, port });
    const finish = (/** @type {boolean} */ connected) => {
      socket.destroy();
      resolveConnect(connected);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

/**
 * @typedef {object} Deps
 * @property {string} root Monorepo root (where package.json lives).
 * @property {typeof run} run
 * @property {typeof isPortInUse} isPortInUse
 * @property {Pick<typeof fs, "existsSync" | "readFileSync" | "writeFileSync" | "copyFileSync">} fs
 * @property {(ms: number) => Promise<unknown>} sleep
 * @property {(line: string) => void} log
 * @property {() => number} now Milliseconds, like `Date.now()`.
 * @property {NodeJS.ProcessEnv} env Process environment (the real `process.env`).
 * @property {string} nodeVersion
 * @property {() => Promise<typeof import("@next/env")>} loadNextEnv
 */

/** @type {Deps} */
export const defaultDeps = {
  // import.meta.url (not import.meta.dirname, Node >= 20.11): on an old Node the
  // requirements step must still run and explain the version, not crash on import.
  root: fileURLToPath(new URL("../..", import.meta.url)),
  run,
  isPortInUse,
  fs,
  sleep: delay,
  log: (line) => console.log(line),
  now: () => Date.now(),
  env: process.env,
  nodeVersion: process.versions.node,
  // Available only after the dependencies step (`npm ci`), hence the lazy load. @next/env
  // is a bundled CommonJS module: a native ESM `import()` exposes only its `default`, so
  // it is loaded with `require` (which behaves the same under Node and Vitest).
  loadNextEnv: async () => /** @type {typeof import("@next/env")} */ (createRequire(import.meta.url)("@next/env")),
};
