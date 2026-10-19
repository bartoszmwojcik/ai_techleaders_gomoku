// Step 5: the target database answers. When it is unreachable and is the local Docker
// default (localhost:5432), start the compose container and wait until the probe passes.
// Readiness is the probe itself, not pg_isready: on a fresh volume the postgres:17
// entrypoint runs a temporary init server that pg_isready would report as ready.
import { maskSecrets } from "../env.mjs";
import { lastLines } from "./dependencies.mjs";

const PROBE_TIMEOUT_MS = 30_000;
const COMPOSE_TIMEOUT_MS = 5 * 60_000;
export const READY_TIMEOUT_MS = 60_000;
export const POLL_INTERVAL_MS = 1_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const POSTGRES_PORT = 5432;

/** @typedef {import("../main.mjs").Context} Context */
/** @typedef {import("../main.mjs").StepResult} StepResult */
/**
 * @typedef {{ ok: true, pending: number }
 *   | { ok: false, kind: "unreachable" | "auth" | "database-missing" | "other", message: string }} DatabaseStatus
 */

/**
 * Runs `npm run db:status` (packages/db/src/cli/status.ts) against the target database.
 *
 * @param {Context} ctx
 * @returns {Promise<DatabaseStatus>}
 */
export async function probeDatabase({ deps, state }) {
  const result = await deps.run("npm", ["run", "db:status", "--silent"], {
    cwd: deps.root,
    env: { ...deps.env, DATABASE_URL: state.databaseUrl },
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  if (result.timedOut) return { ok: false, kind: "unreachable", message: "brak odpowiedzi w 30 s" };
  try {
    // The status is the last line; anything before it is npm noise.
    const status = JSON.parse(result.stdout.trim().replace(/^[\s\S]*\n/, ""));
    if (typeof status?.ok === "boolean") return status;
  } catch {
    // Not a status line: db:status itself failed — report its output below.
  }
  const output = lastLines(result.stderr || result.stdout);
  return { ok: false, kind: "other", message: maskSecrets(output || `db:status zakończone kodem ${result.code}`) };
}

/** Is this the database compose.yaml provides (a local host on port 5432)? */
export function isLocalComposeDatabase(/** @type {string} */ url) {
  try {
    const { hostname, port } = new URL(url);
    return LOCAL_HOSTS.has(hostname) && Number(port || POSTGRES_PORT) === POSTGRES_PORT;
  } catch {
    return false;
  }
}

const KIND_HINTS = {
  auth: "Sprawdź użytkownika i hasło w DATABASE_URL (.env.local).",
  "database-missing": "Utwórz bazę (np. createdb) albo popraw jej nazwę w DATABASE_URL (.env.local).",
  other: "Sprawdź konfigurację bazy i DATABASE_URL (.env.local).",
};

/**
 * @param {Exclude<DatabaseStatus, { ok: true }>} status
 * @returns {StepResult}
 */
function rejected(status) {
  const kind = /** @type {keyof typeof KIND_HINTS} */ (status.kind);
  return { status: "failed", detail: `baza odrzuciła połączenie (${status.kind}): ${status.message}`, hint: KIND_HINTS[kind] };
}

/**
 * @param {Context} ctx
 * @param {string[]} args
 */
function compose({ deps }, args) {
  return deps.run("docker", ["compose", ...args], { cwd: deps.root, env: deps.env, timeoutMs: COMPOSE_TIMEOUT_MS });
}

/** @type {import("../main.mjs").Step} */
export const database = {
  label: "Baza danych",
  async run(ctx) {
    const url = /** @type {string} */ (ctx.state.databaseUrl);
    let status = await probeDatabase(ctx);
    if (status.ok) {
      ctx.state.pendingMigrations = status.pending;
      return { status: "skipped", detail: "pominięto: baza odpowiada" };
    }
    if (status.kind !== "unreachable") return rejected(status);

    const manualHint = "Uruchom PostgreSQL 17 dostępny pod DATABASE_URL albo zmień DATABASE_URL w .env.local.";
    if (!isLocalComposeDatabase(url)) {
      return { status: "failed", detail: `baza nieosiągalna: ${status.message}`, hint: manualHint };
    }
    if ((await compose(ctx, ["version"])).code !== 0) {
      return {
        status: "failed",
        detail: "baza nieosiągalna, a docker compose jest niedostępny",
        hint: `Zainstaluj i uruchom Dockera (docker compose) albo: ${manualHint}`,
      };
    }
    const running = await compose(ctx, ["ps", "--status", "running", "--services"]);
    const containerRunning = running.code === 0 && running.stdout.split("\n").some((line) => line.trim() === "postgres");
    if (!containerRunning && (await ctx.deps.isPortInUse(POSTGRES_PORT))) {
      return {
        status: "failed",
        detail: `port ${POSTGRES_PORT} zajmuje inna instancja PostgreSQL niż kontener z compose.yaml`,
        hint: "Ustaw DATABASE_URL (.env.local) na tę instancję albo zwolnij port i uruchom ponownie. Instalator nie startuje drugiej bazy.",
      };
    }

    const up = await compose(ctx, ["up", "-d"]);
    if (up.code !== 0) {
      return { status: "failed", detail: "docker compose up -d zakończone błędem", hint: maskSecrets(lastLines(up.stderr)) };
    }
    for (let waited = 0; waited < READY_TIMEOUT_MS; waited += POLL_INTERVAL_MS) {
      await ctx.deps.sleep(POLL_INTERVAL_MS);
      status = await probeDatabase(ctx);
      if (status.ok) {
        ctx.state.pendingMigrations = status.pending;
        return { status: "done", detail: "uruchomiono PostgreSQL (docker compose up -d)" };
      }
      if (status.kind !== "unreachable") return rejected(status);
    }
    const logs = await compose(ctx, ["logs", "--tail", "20", "postgres"]);
    return {
      status: "failed",
      detail: `PostgreSQL nie odpowiada po ${READY_TIMEOUT_MS / 1_000} s`,
      hint: maskSecrets(lastLines(`${logs.stdout}\n${logs.stderr}`, 20)),
    };
  },
};
