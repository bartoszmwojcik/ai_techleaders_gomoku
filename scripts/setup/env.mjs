// Which database will `npm run dev` use? Resolved exactly like the app does: @next/env in
// development mode (.env.development.local → .env.local → .env.development → .env), with
// process variables taking precedence, and the default from packages/db/src/config.ts.

/** Mirrors the fallback in packages/db/src/config.ts (a test keeps them in sync). */
export const DEFAULT_DATABASE_URL = "postgresql://gomoku:gomoku@localhost:5432/gomoku";
export const DEFAULT_SOURCE = "domyślny z packages/db/src/config.ts";

const SILENT = { info() {}, error() {} };

/**
 * Hides passwords in connection strings inside `text`: the userinfo password of any URL
 * (greedy up to the last `@` of the authority, so an unencoded `@` in the password does
 * not leak the rest; an empty user name is covered too) and `password=` query parameters.
 * Kept identical to maskSecrets in packages/db/src/cli/status.ts (a test compares them).
 * Known limit: a password containing an unencoded "/" is not a valid URL (WHATWG `URL`
 * rejects it) and is not masked.
 */
export function maskSecrets(/** @type {string} */ text) {
  return text.replace(/(\w+:\/\/[^:/@\s]*:)[^\s/]*@/g, "$1***@").replace(/([?&]password=)[^&\s]+/gi, "$1***");
}

/**
 * @typedef {object} DatabaseTarget
 * @property {string} url
 * @property {string} source Where the value comes from (a file name, the environment, or the default).
 * @property {{ url: string, source: string }} [conflict] Set when the process environment
 *   overrides a different value from the files — the sandbox situation behind lesson
 *   2026-10-18-sandbox-env-overrides.
 */

/**
 * @param {object} args
 * @param {string} args.root
 * @param {NodeJS.ProcessEnv} args.env The real process environment (loadEnvConfig reads it).
 * @param {typeof import("@next/env").loadEnvConfig} args.loadEnvConfig
 * @returns {DatabaseTarget}
 */
export function resolveDatabaseTarget({ root, env, loadEnvConfig }) {
  const fromProcess = env.DATABASE_URL;
  // loadEnvConfig copies every variable from the files into the environment (and sets
  // __NEXT_PROCESSED_ENV, which makes later loads in child processes a no-op), so the
  // environment is restored exactly afterwards: commands the installer runs must load
  // their own .env files as usual.
  const snapshot = { ...env };
  // Hide the process value while reading the files: @next/env never lets a file
  // override (or even report) a variable that is already set in the environment.
  // NODE_ENV=test would switch @next/env to test mode, which skips .env.local;
  // `next dev` always runs in development mode.
  delete env.DATABASE_URL;
  env.NODE_ENV = "development";
  let files;
  try {
    files = loadEnvConfig(root, true, SILENT, true).loadedEnvFiles;
  } finally {
    restoreExactly(env, snapshot);
  }

  const file = files.find((candidate) => candidate.env.DATABASE_URL !== undefined);
  const fileTarget = file
    ? { url: /** @type {string} */ (file.env.DATABASE_URL), source: file.path }
    : { url: DEFAULT_DATABASE_URL, source: DEFAULT_SOURCE };

  if (fromProcess === undefined) return fileTarget;
  if (fromProcess === fileTarget.url) return { url: fromProcess, source: `zmienna środowiskowa, zgodna z ${fileTarget.source}` };
  return { url: fromProcess, source: "zmienna środowiskowa", conflict: fileTarget };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {NodeJS.ProcessEnv} snapshot
 */
function restoreExactly(env, snapshot) {
  for (const name of Object.keys(env)) if (!Object.hasOwn(snapshot, name)) delete env[name];
  Object.assign(env, snapshot);
}
