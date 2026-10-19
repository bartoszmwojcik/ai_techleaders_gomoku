import { describe, expect, it, vi } from "vitest";

import { failure, fakeContext, ok, ROOT } from "../test-helpers";
import { database, isLocalComposeDatabase, POLL_INTERVAL_MS, probeDatabase, READY_TIMEOUT_MS } from "./database.mjs";

const LOCAL = "postgresql://gomoku:pw@localhost:5432/gomoku";
const OK = JSON.stringify({ ok: true, pending: 2 });
const UNREACHABLE = JSON.stringify({ ok: false, kind: "unreachable", message: "connect ECONNREFUSED 127.0.0.1:5432" });

type Script = Partial<Record<"version" | "ps" | "up" | "logs", ReturnType<typeof ok>>> & { probes: string[] };

/** A `run` that answers db:status with the next scripted line and docker compose by sub-command. */
function setup(url: string, script: Script, { portInUse = false } = {}) {
  const probes = [...script.probes];
  const { ctx, run } = fakeContext({
    env: { PATH: "/bin" },
    deps: { isPortInUse: vi.fn().mockResolvedValue(portInUse) },
  });
  ctx.state.databaseUrl = url;
  run.mockImplementation(async (command: string, args: string[]) => {
    if (command === "npm") return ok(`${probes.shift() ?? UNREACHABLE}\n`);
    const sub = args[1] as keyof Omit<Script, "probes">;
    return script[sub] ?? ok();
  });
  return { ctx, run };
}

describe("probeDatabase", () => {
  it("runs db:status with the resolved DATABASE_URL and parses its last line", async () => {
    const { ctx, run } = fakeContext({ env: { PATH: "/bin" } });
    ctx.state.databaseUrl = LOCAL;
    run.mockResolvedValue(ok(`noise\n${OK}\n`));

    await expect(probeDatabase(ctx)).resolves.toEqual({ ok: true, pending: 2 });
    expect(run).toHaveBeenCalledWith("npm", ["run", "db:status", "--silent"], {
      cwd: ROOT,
      env: { PATH: "/bin", DATABASE_URL: LOCAL },
      timeoutMs: 30_000,
    });
  });

  it("treats a hanging probe as unreachable", async () => {
    const { ctx, run } = fakeContext();
    run.mockResolvedValue(failure(null, "", { timedOut: true }));

    await expect(probeDatabase(ctx)).resolves.toEqual({ ok: false, kind: "unreachable", message: "brak odpowiedzi w 30 s" });
  });

  it("reports the output of a db:status that did not print a status", async () => {
    const { ctx, run } = fakeContext();
    run.mockResolvedValueOnce(failure(1, "Error: postgresql://u:secret@h/d failed"));
    await expect(probeDatabase(ctx)).resolves.toEqual({ ok: false, kind: "other", message: "Error: postgresql://u:***@h/d failed" });

    run.mockResolvedValueOnce(ok('{"unexpected":true}'));
    await expect(probeDatabase(ctx)).resolves.toMatchObject({ kind: "other", message: '{"unexpected":true}' });

    run.mockResolvedValueOnce(failure(127));
    await expect(probeDatabase(ctx)).resolves.toMatchObject({ kind: "other", message: "db:status zakończone kodem 127" });

    run.mockResolvedValueOnce(ok("null"));
    await expect(probeDatabase(ctx)).resolves.toMatchObject({ kind: "other" });
  });
});

describe("isLocalComposeDatabase", () => {
  it.each([
    ["postgresql://u:p@localhost:5432/db", true],
    ["postgresql://u:p@localhost/db", true],
    ["postgresql://u:p@127.0.0.1:5432/db", true],
    ["postgresql://u:p@[::1]:5432/db", true],
    ["postgresql://u:p@localhost:5433/db", false],
    ["postgresql://u:p@db.example.com:5432/db", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isLocalComposeDatabase(url)).toBe(expected);
  });
});

describe("database step", () => {
  it("skips a database that answers and remembers the pending migrations", async () => {
    const { ctx, run } = setup(LOCAL, { probes: [OK] });

    await expect(database.run(ctx)).resolves.toEqual({ status: "skipped", detail: "pominięto: baza odpowiada" });
    expect(ctx.state.pendingMigrations).toBe(2);
    expect(run).toHaveBeenCalledOnce();
  });

  it.each([
    ["auth", "Sprawdź użytkownika i hasło"],
    ["database-missing", "Utwórz bazę"],
    ["other", "Sprawdź konfigurację bazy"],
  ])("fails immediately when the database rejects the connection (%s)", async (kind, hint) => {
    const { ctx, run } = setup(LOCAL, { probes: [JSON.stringify({ ok: false, kind, message: "nope" })] });

    const result = await database.run(ctx);

    expect(result).toMatchObject({ status: "failed", detail: `baza odrzuciła połączenie (${kind}): nope` });
    expect(result.hint).toContain(hint);
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not try Docker for a remote database", async () => {
    const { ctx, run } = setup("postgresql://u:p@db.example.com:5432/db", { probes: [UNREACHABLE] });

    await expect(database.run(ctx)).resolves.toMatchObject({ status: "failed", detail: expect.stringContaining("baza nieosiągalna") });
    expect(run).toHaveBeenCalledOnce();
  });

  it("fails with a hint when docker compose is not available", async () => {
    const { ctx } = setup(LOCAL, { probes: [UNREACHABLE], version: failure(null, "", { error: "ENOENT" }) });

    await expect(database.run(ctx)).resolves.toMatchObject({
      status: "failed",
      detail: "baza nieosiągalna, a docker compose jest niedostępny",
    });
  });

  it("refuses to start a second PostgreSQL when another one holds the port", async () => {
    const { ctx, run } = setup(LOCAL, { probes: [UNREACHABLE], ps: ok("") }, { portInUse: true });

    await expect(database.run(ctx)).resolves.toMatchObject({ status: "failed", detail: expect.stringContaining("inna instancja") });
    expect(run).not.toHaveBeenCalledWith("docker", ["compose", "up", "-d"], expect.anything());
  });

  it("starts the compose container and waits until the probe passes", async () => {
    const { ctx, run } = setup(LOCAL, { probes: [UNREACHABLE, UNREACHABLE, OK], ps: ok("") });

    await expect(database.run(ctx)).resolves.toEqual({ status: "done", detail: "uruchomiono PostgreSQL (docker compose up -d)" });
    expect(run).toHaveBeenCalledWith("docker", ["compose", "up", "-d"], { cwd: ROOT, env: { PATH: "/bin" }, timeoutMs: 300_000 });
    expect(ctx.deps.sleep).toHaveBeenCalledTimes(2);
    expect(ctx.state.pendingMigrations).toBe(2);
  });

  it("restarts its own stopped-but-listed container even when the port check is positive", async () => {
    const { ctx } = setup(LOCAL, { probes: [UNREACHABLE, OK], ps: ok("postgres\n") }, { portInUse: true });

    await expect(database.run(ctx)).resolves.toMatchObject({ status: "done" });
  });

  it("treats a failing compose ps as no running container", async () => {
    const { ctx } = setup(LOCAL, { probes: [UNREACHABLE, OK], ps: failure(1) });

    await expect(database.run(ctx)).resolves.toMatchObject({ status: "done" });
  });

  it("reports a failing docker compose up", async () => {
    const { ctx } = setup(LOCAL, { probes: [UNREACHABLE], ps: ok(""), up: failure(1, "port is already allocated") });

    await expect(database.run(ctx)).resolves.toEqual({
      status: "failed",
      detail: "docker compose up -d zakończone błędem",
      hint: "port is already allocated",
    });
  });

  it("stops waiting when the started database rejects the connection", async () => {
    const auth = JSON.stringify({ ok: false, kind: "auth", message: "password authentication failed" });
    const { ctx } = setup(LOCAL, { probes: [UNREACHABLE, auth], ps: ok("") });

    await expect(database.run(ctx)).resolves.toMatchObject({ status: "failed", detail: expect.stringContaining("(auth)") });
  });

  it("gives up after the readiness timeout and shows the container logs", async () => {
    const attempts = READY_TIMEOUT_MS / POLL_INTERVAL_MS;
    const { ctx } = setup(LOCAL, {
      probes: Array(attempts + 1).fill(UNREACHABLE),
      ps: ok(""),
      logs: ok("FATAL: data directory has wrong ownership", ),
    });

    const result = await database.run(ctx);

    expect(result).toMatchObject({ status: "failed", detail: "PostgreSQL nie odpowiada po 60 s" });
    expect(result.hint).toContain("wrong ownership");
    expect(ctx.deps.sleep).toHaveBeenCalledTimes(attempts);
  });
});
