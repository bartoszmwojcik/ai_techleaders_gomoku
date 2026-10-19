import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

describe("GET /api/health", () => {
  it("reports the database from the test container as reachable", async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: { ok: true } });
  });
});
