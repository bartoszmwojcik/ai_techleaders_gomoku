// Side-effecting adapters used by the installer. Everything here is injected into the
// steps (see `defaultDeps`), so unit tests replace it with fakes and never run npm,
// Docker or touch the network. Only Node built-ins: the installer runs before `npm ci`.
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

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

/**
 * Runs a command with fixed arguments and collects its output.
 *
 * On Windows `npm`, `npx` and `docker` are shims that need a shell; the command is
 * then passed as a single string (passing an argument array together with
 * `shell: true` is deprecated, DEP0190). Arguments are constants defined by the
 * installer, never user input, and secrets travel only through `env`.
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
    let timedOut = false;
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", (/** @type {NodeJS.ErrnoException} */ error) => {
      clearTimeout(timer);
      resolveRun({ code: null, stdout, stderr, timedOut: false, error: error.code ?? error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code: timedOut ? null : code, stdout, stderr, timedOut });
    });
  });
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
 * @property {NodeJS.ProcessEnv} env Process environment (the real `process.env`).
 * @property {string} nodeVersion
 * @property {() => Promise<typeof import("@next/env")>} loadNextEnv
 */

/** @type {Deps} */
export const defaultDeps = {
  root: resolve(import.meta.dirname, "../.."),
  run,
  isPortInUse,
  fs,
  sleep: delay,
  log: (line) => console.log(line),
  env: process.env,
  nodeVersion: process.versions.node,
  // Available only after the dependencies step (`npm ci`), hence the lazy import.
  loadNextEnv: () => import("@next/env"),
};
