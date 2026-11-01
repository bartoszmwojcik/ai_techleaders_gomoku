import { describe, expect, it, vi } from "vitest";

import { runStats } from "./run-stats";

function setup(execute: () => Promise<unknown>) {
  const fork = { execute: vi.fn<(sql: string, params: unknown[]) => Promise<unknown>>(execute) };
  const orm = { em: { fork: vi.fn(() => fork) }, close: vi.fn().mockResolvedValue(undefined) };
  return {
    fork,
    orm,
    createOrm: vi.fn().mockResolvedValue(orm),
    stdout: { write: vi.fn() },
    stderr: { write: vi.fn() },
  };
}

describe("runStats", () => {
  it("prints the stats as one JSON line, returns 0 and closes the ORM", async () => {
    const s = setup(async () => [
      { kind_a: "guest", kind_b: "guest", total: 3, today: 1, last7_days: 3 },
    ]);
    const now = new Date("2026-10-31T12:00:00Z");

    const code = await runStats({ createOrm: s.createOrm, now: () => now, stdout: s.stdout, stderr: s.stderr });

    expect(code).toBe(0);
    expect(s.createOrm).toHaveBeenCalledWith({ ensureDatabase: false, pool: { min: 0, max: 1 } });
    expect(s.fork.execute.mock.calls[0]![1]).toEqual([now]);
    const line = s.stdout.write.mock.calls[0]![0] as string;
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toMatchObject({ timeZone: "Europe/Warsaw", total: 3, today: 1, last7Days: 3 });
    expect(s.stderr.write).not.toHaveBeenCalled();
    expect(s.orm.close).toHaveBeenCalledOnce();
  });

  it("uses the system clock and stdio by default", async () => {
    const s = setup(async () => []);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await runStats({ createOrm: s.createOrm })).toBe(0);
      expect(JSON.parse(write.mock.calls[0]![0] as string).total).toBe(0);
    } finally {
      write.mockRestore();
    }
  });

  it("reports a masked message on stderr and returns 1 when the database fails", async () => {
    const s = setup(() => Promise.reject(new Error("failed postgres://u:secret@host/db")));

    const code = await runStats({ createOrm: s.createOrm, stdout: s.stdout, stderr: s.stderr });

    expect(code).toBe(1);
    expect(s.stdout.write).not.toHaveBeenCalled();
    const line = s.stderr.write.mock.calls[0]![0] as string;
    expect(line).not.toContain("secret");
    expect(JSON.parse(line)).toMatchObject({ ok: false });
    expect(s.orm.close).toHaveBeenCalledOnce();
  });

  it("reports a failure to connect and has no ORM to close", async () => {
    const stderr = { write: vi.fn() };
    const createOrm = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    expect(await runStats({ createOrm, stderr })).toBe(1);
    expect(stderr.write).toHaveBeenCalledOnce();
  });
});
