import type { Orm } from "@gomoku/db";
import { Migrator } from "@mikro-orm/migrations";
import { describe, expect, it, vi } from "vitest";

import { classifyError, getDatabaseStatus, maskSecrets } from "./status";

function fakeOrm({ execute = vi.fn().mockResolvedValue([]), pending = [] as unknown[] } = {}) {
  const close = vi.fn().mockResolvedValue(undefined);
  const orm = {
    em: { getConnection: () => ({ execute }) },
    migrator: { getPending: vi.fn().mockResolvedValue(pending) },
    close,
  } as unknown as Orm;
  return { orm, execute, close };
}

describe("getDatabaseStatus", () => {
  it("reports the number of pending migrations when the database answers", async () => {
    const { orm, execute, close } = fakeOrm({ pending: [{ name: "a" }, { name: "b" }] });
    const createOrm = vi.fn().mockResolvedValue(orm);

    await expect(getDatabaseStatus(createOrm)).resolves.toEqual({ ok: true, pending: 2 });
    expect(execute).toHaveBeenCalledWith("select 1");
    expect(close).toHaveBeenCalledOnce();
    expect(createOrm).toHaveBeenCalledWith(
      expect.objectContaining({ extensions: [Migrator], ensureDatabase: false, pool: { min: 0, max: 1 } }),
    );
  });

  it("classifies a failing query and still closes the ORM", async () => {
    const error = Object.assign(new Error("password authentication failed"), { code: "28P01" });
    const { orm, close } = fakeOrm({ execute: vi.fn().mockRejectedValue(error) });

    await expect(getDatabaseStatus(vi.fn().mockResolvedValue(orm))).resolves.toEqual({
      ok: false,
      kind: "auth",
      message: "password authentication failed",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports a failure to create the ORM", async () => {
    await expect(getDatabaseStatus(vi.fn().mockRejectedValue(new Error("bad config")))).resolves.toEqual({
      ok: false,
      kind: "other",
      message: "bad config",
    });
  });

  it("uses the real ORM factory by default", async () => {
    // Port 1 never runs PostgreSQL: the probe fails fast without a database.
    vi.stubEnv("DATABASE_URL", "postgresql://nobody:secret@127.0.0.1:1/none");

    await expect(getDatabaseStatus()).resolves.toMatchObject({ ok: false, kind: "unreachable" });
  });
});

describe("classifyError", () => {
  it.each([
    ["ECONNREFUSED", "unreachable"],
    ["ENOTFOUND", "unreachable"],
    ["ETIMEDOUT", "unreachable"],
    ["57P03", "unreachable"],
    ["28P01", "auth"],
    ["28000", "auth"],
    ["3D000", "database-missing"],
    ["42P01", "other"],
  ])("maps %s to %s", (code, kind) => {
    expect(classifyError(Object.assign(new Error("x"), { code }))).toMatchObject({ kind });
  });

  it("explains an AggregateError (dual-stack host) by its inner errors", () => {
    const error = Object.assign(
      new AggregateError([new Error("connect ECONNREFUSED ::1:5432"), "connect ECONNREFUSED 127.0.0.1:5432"], ""),
      { code: "ECONNREFUSED" },
    );

    expect(classifyError(error)).toEqual({
      kind: "unreachable",
      message: "connect ECONNREFUSED ::1:5432; connect ECONNREFUSED 127.0.0.1:5432",
    });
    expect(classifyError(new AggregateError([], "all failed")).message).toBe("all failed");
  });

  it("handles errors without a code and non-Error values", () => {
    expect(classifyError(new Error("boom"))).toEqual({ kind: "other", message: "boom" });
    expect(classifyError({ code: 5 })).toEqual({ kind: "other", message: "[object Object]" });
    expect(classifyError(null)).toEqual({ kind: "other", message: "null" });
  });

  it("never leaks a password from the message", () => {
    expect(classifyError(new Error("failed postgresql://gomoku:s3cret@db:5432/gomoku")).message).toBe(
      "failed postgresql://gomoku:***@db:5432/gomoku",
    );
  });
});

describe("maskSecrets", () => {
  it("masks every URL password and leaves URLs without one alone", () => {
    expect(maskSecrets("a postgres://u:p@h/d and postgresql://x:y@z/w")).toBe("a postgres://u:***@h/d and postgresql://x:***@z/w");
    expect(maskSecrets("postgresql://localhost:5432/gomoku")).toBe("postgresql://localhost:5432/gomoku");
    expect(maskSecrets("postgresql://u:p@ss@h/db?password=x")).toBe("postgresql://u:***@h/db?password=***");
  });
});
