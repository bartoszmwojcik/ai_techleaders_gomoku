import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, POST } from "./route";

const { connection, handleMcpPost, methodNotAllowed } = vi.hoisted(() => ({
  connection: vi.fn(),
  handleMcpPost: vi.fn(),
  methodNotAllowed: vi.fn(() => new Response(null, { status: 405 })),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/mcp/mcp-endpoint", () => ({ handleMcpPost, methodNotAllowed }));

const cradle = { serverConfig: { id: "config" }, rateLimiter: { id: "limiter" }, agentSeatService: { id: "seat" } };
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle }),
}));

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  handleMcpPost.mockReset().mockResolvedValue(new Response("ok", { status: 200 }));
});

describe("/api/mcp", () => {
  it("serves POST from the request scope, dynamically", async () => {
    const request = new Request("http://localhost/api/mcp", { method: "POST", body: "{}" });

    const response = await POST(request);

    expect(connection).toHaveBeenCalledOnce();
    expect(handleMcpPost).toHaveBeenCalledExactlyOnceWith(request, {
      serverConfig: cradle.serverConfig,
      rateLimiter: cradle.rateLimiter,
      agentSeatService: cradle.agentSeatService,
    });
    expect(response.status).toBe(200);
  });

  it("answers GET and DELETE with 405", () => {
    expect(GET().status).toBe(405);
    expect(DELETE().status).toBe(405);
    expect(methodNotAllowed).toHaveBeenCalledTimes(2);
  });
});
