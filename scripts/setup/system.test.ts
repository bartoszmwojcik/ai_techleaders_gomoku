import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
const net = vi.hoisted(() => ({ createConnection: vi.fn() }));
vi.mock("node:net", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:net")>();
  net.createConnection.mockImplementation(original.createConnection);
  return { ...original, createConnection: net.createConnection };
});

const { defaultDeps, isPortInUse, KILL_GRACE_MS, run } = await import("./system.mjs");

type FakeChild = EventEmitter & {
  stdout?: EventEmitter;
  stderr?: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

type FakeStream = EventEmitter & { destroy: ReturnType<typeof vi.fn> };

const fakeStream = () => Object.assign(new EventEmitter(), { destroy: vi.fn() }) as FakeStream;

/** A child that never closes on its own — like a grandchild holding the pipes open. */
function fakeChild({ withStreams = true } = {}): FakeChild & { pid?: number } {
  const child = Object.assign(new EventEmitter(), {
    pid: 4242 as number | undefined,
    exitCode: null as number | null,
    signalCode: null as string | null,
    kill: vi.fn(),
  }) as FakeChild & { stdout?: FakeStream; stderr?: FakeStream };
  if (withStreams) {
    child.stdout = fakeStream();
    child.stderr = fakeStream();
  }
  spawn.mockReturnValueOnce(child);
  return child;
}

afterEach(() => {
  spawn.mockReset();
});

describe("run", () => {
  it("collects stdout and stderr and resolves with the exit code", async () => {
    const child = fakeChild();
    const result = run("npm", ["ci"], { cwd: "/repo", env: { A: "1" }, timeoutMs: 1_000, platform: "linux" });
    child.stdout?.emit("data", "out");
    child.stderr?.emit("data", "err");
    child.emit("close", 2);

    await expect(result).resolves.toEqual({ code: 2, stdout: "out", stderr: "err", timedOut: false });
    expect(spawn).toHaveBeenCalledWith("npm", ["ci"], { cwd: "/repo", env: { A: "1" } });
  });

  it("passes the command as one string through a shell on Windows", async () => {
    const child = fakeChild({ withStreams: false });
    const result = run("docker", ["compose", "up", "-d"], { timeoutMs: 1_000, platform: "win32" });
    child.emit("close", 0);

    await expect(result).resolves.toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(spawn).toHaveBeenCalledWith("docker compose up -d", { cwd: undefined, env: undefined, shell: true });
  });

  it("resolves on timeout without waiting for close, then escalates to SIGKILL", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const result = run("npm", ["run", "db:status"], { timeoutMs: 5, platform: "linux" });
      child.stdout?.emit("data", "partial");
      await vi.advanceTimersByTimeAsync(5);

      await expect(result).resolves.toEqual({ code: null, stdout: "partial", stderr: "", timedOut: true });
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
      expect((child.stdout as FakeStream).destroy).toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(KILL_GRACE_MS);
      expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");

      // A late close does not change the settled result.
      child.emit("close", 0);
      await expect(result).resolves.toMatchObject({ timedOut: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not SIGKILL a process that exited during the grace period", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild({ withStreams: false }) as FakeChild & { exitCode: number | null };
      const result = run("npm", ["ci"], { timeoutMs: 5, platform: "linux" });
      await vi.advanceTimersByTimeAsync(5);
      await result;
      child.exitCode = 143;
      await vi.advanceTimersByTimeAsync(KILL_GRACE_MS);

      expect(child.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("terminates the whole process tree with taskkill on Windows", async () => {
    vi.useFakeTimers();
    try {
      const child = fakeChild();
      const taskkill = Object.assign(new EventEmitter(), {});
      spawn.mockReturnValueOnce(taskkill);
      const result = run("npm", ["ci"], { timeoutMs: 5, platform: "win32" });
      await vi.advanceTimersByTimeAsync(5);

      await expect(result).resolves.toMatchObject({ timedOut: true });
      expect(spawn).toHaveBeenLastCalledWith("taskkill", ["/PID", "4242", "/T", "/F"], { windowsHide: true });
      expect(child.kill).not.toHaveBeenCalled();
      taskkill.emit("error", new Error("taskkill missing")); // must not throw

      const notStarted = fakeChild();
      notStarted.pid = undefined;
      const noPid = run("npm", ["ci"], { timeoutMs: 5, platform: "win32" });
      await vi.advanceTimersByTimeAsync(5);
      await expect(noPid).resolves.toMatchObject({ timedOut: true });
      expect(spawn).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a command that cannot be started", async () => {
    const missing = fakeChild();
    const first = run("docker", ["compose", "version"], { timeoutMs: 1_000 });
    missing.emit("error", Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" }));
    await expect(first).resolves.toMatchObject({ code: null, error: "ENOENT", timedOut: false });

    const broken = fakeChild();
    const second = run("docker", ["compose", "version"], { timeoutMs: 1_000 });
    broken.emit("error", new Error("boom"));
    await expect(second).resolves.toMatchObject({ code: null, error: "boom" });
  });
});

describe("isPortInUse", () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise((done) => (server ? server.close(done) : done(undefined)));
    server = undefined;
  });

  async function listen(): Promise<number> {
    server = createServer();
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    return (server.address() as { port: number }).port;
  }

  it("detects a local listener", async () => {
    await expect(isPortInUse(await listen())).resolves.toBe(true);
  });

  it("reports a free port", async () => {
    const port = await listen();
    await new Promise((done) => server!.close(done));
    server = undefined;

    await expect(isPortInUse(port)).resolves.toBe(false);
  });

  it("treats a connection that does not answer in time as free", async () => {
    net.createConnection.mockImplementation(() => {
      const socket = Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
        setTimeout: (_ms: number, onTimeout: () => void) => queueMicrotask(onTimeout),
      });
      return socket;
    });

    await expect(isPortInUse(5432, 10)).resolves.toBe(false);
  });
});

describe("defaultDeps", () => {
  it("points at the monorepo root and wires the real adapters", async () => {
    const packageJson = JSON.parse(readFileSync(resolve(defaultDeps.root, "package.json"), "utf8"));
    expect(packageJson.name).toBe("gomoku");
    expect(defaultDeps).toMatchObject({ run, isPortInUse, env: process.env, nodeVersion: process.versions.node });
    expect(defaultDeps.fs.existsSync).toBe(existsSync);
    await expect(defaultDeps.sleep(0)).resolves.toBeUndefined();
    expect(Math.abs(defaultDeps.now() - Date.now())).toBeLessThan(1_000);
    await expect(defaultDeps.loadNextEnv()).resolves.toMatchObject({ loadEnvConfig: expect.any(Function) });
  });

  it("logs to the console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultDeps.log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
  });
});
