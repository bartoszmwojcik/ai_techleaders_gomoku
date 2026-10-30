import { describe, expect, it, vi } from "vitest";

import { runCleanup } from "./run-cleanup";


function setup(execute: () => Promise<unknown>) {
  const fork = { execute: vi.fn(execute) };
  const orm = { em: { fork: vi.fn(() => fork) }, close: vi.fn().mockResolvedValue(undefined) };
  const createOrm = vi.fn().mockResolvedValue(orm);
  const stdout = { write: vi.fn() };
  const stderr = { write: vi.fn() };
  return { fork, orm, createOrm, stdout, stderr };
}

describe("runCleanup", () => {
  it("prints the result as JSON, returns 0 and closes the ORM", async () => {
    const s = setup(async () => ({ affectedRows: 2 }));

    const code = await runCleanup({ createOrm: s.createOrm, stdout: s.stdout, stderr: s.stderr });

    expect(code).toBe(0);
    expect(s.createOrm).toHaveBeenCalledWith({ ensureDatabase: false, pool: { min: 0, max: 1 } });
    expect(JSON.parse(s.stdout.write.mock.calls[0]![0])).toEqual({
      sessions: 2,
      rateLimitBuckets: 2,
      emailVerificationTokens: 2,
      passwordResetTokens: 2,
      waitingGames: 2,
      cancelledGames: 2,
      guestTokens: 2,
      unverifiedUsers: 2,
      errors: [],
      truncated: false,
    });
    expect(s.stderr.write).not.toHaveBeenCalled();
    expect(s.orm.close).toHaveBeenCalledOnce();
  });

  it("prints the partial result, reports failed rules without messages and returns 1", async () => {
    const s = setup(() => Promise.reject(Object.assign(new Error("relation x missing"), { code: "42P01" })));

    const code = await runCleanup({ createOrm: s.createOrm, stdout: s.stdout, stderr: s.stderr });

    expect(code).toBe(1);
    expect(JSON.parse(s.stdout.write.mock.calls[0]![0]).errors).toHaveLength(8);
    const line = s.stderr.write.mock.calls[0]![0] as string;
    expect(JSON.parse(line)).toEqual({
      ok: false,
      errors: ["sessions", "rateLimitBuckets", "emailVerificationTokens", "passwordResetTokens", "waitingGames", "cancelledGames", "guestTokens", "unverifiedUsers"].map((rule) => ({
        rule,
        code: "42P01",
      })),
    });
    expect(line).not.toContain("relation x missing");
    expect(s.orm.close).toHaveBeenCalledOnce();
  });

  it("returns 1 with a masked message and closes the ORM when cleanup itself throws", async () => {
    const s = setup(async () => ({ affectedRows: 0 }));
    s.orm.em.fork.mockImplementation(() => {
      throw new Error("connect failed postgresql://gomoku:s3cret@db:5432/gomoku");
    });

    const code = await runCleanup({ createOrm: s.createOrm, stdout: s.stdout, stderr: s.stderr });

    expect(code).toBe(1);
    expect(s.stdout.write).not.toHaveBeenCalled();
    const line = s.stderr.write.mock.calls[0]![0] as string;
    expect(line).not.toContain("s3cret");
    expect(JSON.parse(line)).toEqual({ ok: false, error: "connect failed postgresql://gomoku:***@db:5432/gomoku" });
    expect(s.orm.close).toHaveBeenCalledOnce();
  });

  it("returns 1 when the ORM cannot be created (nothing to close)", async () => {
    const createOrm = vi.fn().mockRejectedValue(new Error("boom"));
    const stderr = { write: vi.fn() };

    expect(await runCleanup({ createOrm, stdout: { write: vi.fn() }, stderr })).toBe(1);
    expect(stderr.write).toHaveBeenCalledWith('{"ok":false,"error":"boom"}\n');
  });

  it("uses the real clock and process streams by default", async () => {
    const createOrm = vi.fn().mockRejectedValue(new Error("x"));
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(await runCleanup({ createOrm })).toBe(1);
    expect(write).toHaveBeenCalled();
    write.mockRestore();
  });

  it("uses the real ORM factory and clock by default", async () => {
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };
    vi.stubEnv("DATABASE_URL", "postgresql://nobody:nothing@127.0.0.1:1/none");
    // Port 1 refuses connections: exercises default createOrm/now and the error path.
    expect(await runCleanup({ stdout, stderr })).toBe(1);
    expect(stderr.write.mock.calls[0]![0]).not.toContain("nothing");
  });
});
