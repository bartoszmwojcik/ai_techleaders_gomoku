import { describe, expect, it, vi } from "vitest";

import { failure, fakeContext, ok, ROOT } from "../test-helpers";
import { database, isLocalComposeDatabase, POLL_INTERVAL_MS, probeDatabase, READY_TIMEOUT_MS } from "./database.mjs";

const LOCAL = "postgresql://gomoku:pw@localhost:5432/gomoku";
const OK = JSON.stringify({ ok: true, pending: 2 });
const UNREACHABLE = JSON.stringify({ ok: false, kind: "unreachable", message: "connect ECONNREFUSED 127.0.0.1:5432" });

type Script = Partial<Record<"version" | "info" | "ps" | "up" | "logs", ReturnType<typeof ok>>> & {
  probes: string[];
  /** Virtual milliseconds each db:status call takes. */
  probeMs?: number;
};

/** A `run` that answers db:status with the next scripted line and docker compose by sub-command. */
function setup(url: string, script: Script, { portInUse = false } = {}) {
  const probes = [...script.probes];
  const { ctx, run, clock } = fakeContext({
    env: { PATH: "/bin" },
    deps: { isPortInUse: vi.fn().mockResolvedValue(portInUse) },
  });
  ctx.state.databaseUrl = url;
  run.mockImplementation(async (command: string, args: string[]) => {
    if (command === "npm") {
      clock.now += script.probeMs ?? 0;
      return ok(`${probes.shift() ?? UNREACHABLE}\n`);
    }
    const sub = (args[0] === "compose" ? args[1] : args[0]) as keyof Omit<Script, "probes" | "probeMs">;
    return script[sub] ?? ok();
  });
  return { ctx, run, clock };
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
    await expect(probeDatabase(ctx, 12_400)).resolves.toMatchObject({ message: "brak odpowiedzi w 12 s" });
    expect(run).toHaveBeenLastCalledWith("npm", expect.anything(), expect.objectContaining({ timeoutMs: 12_400 }));
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

  it("fails with a hint when the Docker daemon is not running", async () => {
    const { ctx, run } = setup(LOCAL, { probes: [UNREACHABLE], info: failure(1, "Cannot connect to the Docker daemon") });

    await expect(database.run(ctx)).resolves.toMatchObject({ status: "failed", detail: "baza nieosiągalna, a Docker nie działa" });
    expect(run).toHaveBeenCalledWith("docker", ["info"], { cwd: ROOT, env: { PATH: "/bin" }, timeoutMs: 30_000 });
  });

  it("refuses to start a second PostgreSQL when another one holds the port", async () => {
    const { ctx, run } = setup(LOCAL, { probes: [UNREACHABLE], ps: ok("") }, { portInUse: true });

    const result = await database.run(ctx);

    expect(result).toMatchObject({ status: "failed", detail: expect.stringContaining("inna instancja") });
    expect(result.hint).toContain("docker compose -p <nazwa-tamtego-katalogu> down");
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

  it("gives up after 60 s of wall time, however long each probe takes", async () => {
    const { ctx, clock } = setup(LOCAL, {
      probes: [],
      probeMs: 2_000,
      ps: ok(""),
      logs: ok("FATAL: data directory has wrong ownership"),
    });

    const result = await database.run(ctx);
    const startedWaiting = clock.now; // read after the run: the loop is over

    expect(result).toMatchObject({ status: "failed", detail: "PostgreSQL nie odpowiada po 60 s" });
    expect(result.hint).toContain("wrong ownership");
    // 1 s sleep + 2 s probe per attempt: 20 attempts fit into 60 s, not 60.
    expect(ctx.deps.sleep).toHaveBeenCalledTimes(20);
    expect(startedWaiting).toBeLessThanOrEqual(1_000_000 + 2_000 + READY_TIMEOUT_MS + POLL_INTERVAL_MS);
  });

  it("limits the last probe to the time left and stops when the deadline passes during a sleep", async () => {
    const { ctx, run, clock } = setup(LOCAL, { probes: [], probeMs: 25_000, ps: ok("") });

    await database.run(ctx);

    const probeTimeouts = run.mock.calls
      .filter(([command]) => command === "npm")
      .map(([, , options]) => (options as { timeoutMs: number }).timeoutMs);
    // initial probe 30 s; then 59 s left → 30 s; 33 s left → 30 s; 7 s left → 7 s.
    expect(probeTimeouts).toEqual([30_000, 30_000, 30_000, 7_000]);
    expect(clock.now).toBeGreaterThan(1_000_000);

    // The deadline can also pass while sleeping: no probe is started then.
    const late = setup(LOCAL, { probes: [], probeMs: 0, ps: ok("") });
    (late.ctx.deps.sleep as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      late.clock.now += READY_TIMEOUT_MS;
    });
    await expect(database.run(late.ctx)).resolves.toMatchObject({ detail: "PostgreSQL nie odpowiada po 60 s" });
    expect(late.run.mock.calls.filter(([command]) => command === "npm")).toHaveLength(1);
  });
});
