import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HealthReport } from "@/server/services/health-service";

import { GET } from "./route";

const { connection, check } = vi.hoisted(() => ({ connection: vi.fn(), check: vi.fn() }));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { healthService: { check } } }),
}));

const failing: HealthReport = {
  status: "error",
  database: { ok: false, reason: "connect ECONNREFUSED 10.0.0.5:5432" },
};

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  check.mockReset();
});

describe("GET /api/health", () => {
  it("responds 200 with the report when the database is reachable", async () => {
    check.mockResolvedValue({ status: "ok", database: { ok: true } } satisfies HealthReport);

    const response = await GET();

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: { ok: true } });
  });

  it("responds 503 with the failure reason outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    check.mockResolvedValue(failing);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(failing);
  });

  it("responds 503 without infrastructure details in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    check.mockResolvedValue(failing);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "error", database: { ok: false } });
  });
});
