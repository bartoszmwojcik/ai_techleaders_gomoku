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

  it("reports the error message when the query fails", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    await expect(new HealthService({ orm: ormWith(execute) }).check()).resolves.toEqual({
      status: "error",
      database: { ok: false, reason: "connect ECONNREFUSED 127.0.0.1:5432" },
    });
  });

  it("stringifies a non-Error rejection", async () => {
    const execute = vi.fn().mockRejectedValue("timeout");

    await expect(new HealthService({ orm: ormWith(execute) }).check()).resolves.toEqual({
      status: "error",
      database: { ok: false, reason: "timeout" },
    });
  });
});
