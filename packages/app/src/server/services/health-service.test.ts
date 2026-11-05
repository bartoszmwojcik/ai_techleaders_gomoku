import type { Orm } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { HealthService } from "./health-service";

function ormWith(execute: () => Promise<unknown>): Orm {
  return { em: { getConnection: () => ({ execute }) } } as unknown as Orm;
}

describe("HealthService", () => {
  it("reports ok when the database answers a query", async () => {
    const execute = vi.fn().mockResolvedValue([{ "?column?": 1 }]);

    await expect(new HealthService({ orm: ormWith(execute) }).check()).resolves.toEqual({
      status: "ok",
      database: { ok: true },
    });
    expect(execute).toHaveBeenCalledWith("select 1");
  });

  it("reports the class and code of the error, never its message", async () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432 user=gomoku"), { code: "ECONNREFUSED" });
    const execute = vi.fn().mockRejectedValue(error);

    await expect(new HealthService({ orm: ormWith(execute) }).check()).resolves.toEqual({
      status: "error",
      database: { ok: false, reason: "Error ECONNREFUSED" },
    });
  });

  it("reports only the class of an error without a code and the type of a non-Error rejection", async () => {
    const plain = vi.fn().mockRejectedValue(new TypeError("secret detail"));
    await expect(new HealthService({ orm: ormWith(plain) }).check()).resolves.toMatchObject({
      database: { ok: false, reason: "TypeError" },
    });
    const text = vi.fn().mockRejectedValue("timeout");
    await expect(new HealthService({ orm: ormWith(text) }).check()).resolves.toMatchObject({
      database: { ok: false, reason: "string" },
    });
  });
});
