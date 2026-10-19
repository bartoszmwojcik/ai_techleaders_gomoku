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

const { defaultDeps, isPortInUse, run } = await import("./system.mjs");

type FakeChild = EventEmitter & {
  stdout?: EventEmitter;
  stderr?: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

function fakeChild({ withStreams = true } = {}): FakeChild {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(() => child.emit("close", null)),
  }) as FakeChild;
  if (withStreams) {
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
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

  it("kills the process and reports a timeout", async () => {
    const child = fakeChild();
    const result = await run("npm", ["run", "db:status"], { timeoutMs: 5 });

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(result).toMatchObject({ code: null, timedOut: true });
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
    await expect(defaultDeps.loadNextEnv()).resolves.toMatchObject({ loadEnvConfig: expect.any(Function) });
  });

  it("logs to the console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultDeps.log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
  });
});
