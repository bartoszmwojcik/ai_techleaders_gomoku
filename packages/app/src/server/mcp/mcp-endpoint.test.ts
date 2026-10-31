import { ConflictError, MCP_BODY_MAX_BYTES, TooManyRequestsError, ValidationError, GoneError } from "@gomoku/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readServerConfig } from "../config";
import { hashOpaqueToken } from "../http/opaque-token";
import { handleMcpPost, methodNotAllowed, type McpEndpointDeps } from "./mcp-endpoint";
import { MCP_TOOL_NAMES } from "./mcp-server";

const ORIGIN = "https://gomoku.example";
const production = { NODE_ENV: "production", TRUST_PROXY_HOPS: "1", APP_ORIGIN: ORIGIN };

const RESULT = {
  token: "t".repeat(43),
  gameId: "game-1",
  you: { seat: 2, color: "black" },
  status: "active",
  opponent: { kind: "account" },
};

const STATE = { status: "active", turn: "you", nextMoveNumber: 1 };
const TOKEN = "t".repeat(43);

function deps(over: Partial<McpEndpointDeps> = {}, env: Record<string, string> = production): McpEndpointDeps {
  return {
    serverConfig: readServerConfig(env),
    rateLimiter: { hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 60 })) },
    agentSeatService: { join: vi.fn(async () => RESULT) } as never,
    agentGameService: {
      getState: vi.fn(async () => STATE),
      playMove: vi.fn(async () => STATE),
    } as never,
    ...over,
  };
}

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
};

function post(body: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  return new Request(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-for": "2.2.2.2",
      ...headers,
    },
    body: raw ?? JSON.stringify(body),
  });
}

const modern = (method: string, params: Record<string, unknown> = {}, name?: string) =>
  post(
    { jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } },
    { "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(name && { "mcp-name": name }) },
  );

const call = (args: Record<string, unknown>) => modern("tools/call", { name: "join", arguments: args }, "join");

afterEach(() => vi.restoreAllMocks());

describe("handleMcpPost", () => {
  it("lists the tools: only join, and nothing that creates invitations or touches the lobby (BR-30)", async () => {
    const response = await handleMcpPost(modern("tools/list"), deps());

    expect(response.status).toBe(200);
    const { result } = (await response.json()) as { result: { tools: { name: string; inputSchema: unknown }[] } };
    expect(result.tools.map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES]);
    expect(result.tools.map((tool) => tool.name)).toEqual(["join", "get_state", "play_move"]);
    expect(result.tools[0]!.inputSchema).toMatchObject({
      type: "object",
      properties: {
        code: { type: "string", maxLength: 64 },
        agentName: { type: "string", maxLength: 40 },
      },
      required: ["code"],
    });
  });

  it("describes get_state and play_move for the client: limits, required fields, data only", async () => {
    const response = await handleMcpPost(modern("tools/list"), deps());
    const { result } = (await response.json()) as {
      result: { tools: { name: string; description: string; inputSchema: Record<string, any> }[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const [, getState, playMove] = result.tools;

    expect(getState!.inputSchema).toMatchObject({
      properties: {
        token: { type: "string", minLength: 43, maxLength: 43 },
        waitSeconds: { type: "integer", minimum: 0, maximum: 25 },
        afterMove: { type: "integer", minimum: 0 },
      },
      required: ["token"],
    });
    expect(playMove!.inputSchema).toMatchObject({
      properties: { x: { maximum: 14 }, y: { maximum: 14 }, moveNumber: { minimum: 1, maximum: 225 } },
      required: ["token", "x", "y", "moveNumber"],
    });
    for (const tool of [getState!, playMove!]) expect(tool.description).toMatch(/nie instrukcje/);
    expect(playMove!.description).toContain("ILLEGAL_MOVE");
  });

  it("calls get_state with the arguments as sent and the signal of the request", async () => {
    const d = deps();

    const response = await handleMcpPost(
      modern("tools/call", { name: "get_state", arguments: { token: TOKEN, waitSeconds: 3 } }, "get_state"),
      d,
    );

    const { result } = (await response.json()) as { result: Record<string, unknown> };
    expect(result.structuredContent).toEqual(STATE);
    expect(d.agentGameService.getState).toHaveBeenCalledExactlyOnceWith(
      { token: TOKEN, waitSeconds: 3 },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("calls play_move with the arguments as sent", async () => {
    const d = deps();
    const args = { token: TOKEN, x: 7, y: 7, moveNumber: 1 };

    const response = await handleMcpPost(
      modern("tools/call", { name: "play_move", arguments: args }, "play_move"),
      d,
    );

    const { result } = (await response.json()) as { result: Record<string, unknown> };
    expect(result.structuredContent).toEqual(STATE);
    expect(d.agentGameService.playMove).toHaveBeenCalledExactlyOnceWith(args);
  });

  it.each([
    ["get_state", "getState"],
    ["play_move", "playMove"],
  ] as const)("answers an error of %s as a tool error in the one shape", async (name, method) => {
    const d = deps();
    (d.agentGameService[method] as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConflictError("Teraz ruch przeciwnika.", { code: "NOT_YOUR_TURN" }),
    );

    const response = await handleMcpPost(modern("tools/call", { name, arguments: {} }, name), d);

    const { result } = (await response.json()) as { result: Record<string, unknown> };
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "NOT_YOUR_TURN", message: "Teraz ruch przeciwnika.", retryable: true },
    });
  });

  it("calls join with the code and the declared name and returns the result once, as structured data", async () => {
    const d = deps();

    const response = await handleMcpPost(call({ code: "ABCD-EFGH", agentName: "claude opus 5.5" }), d);

    const { result } = (await response.json()) as { result: Record<string, unknown> };
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(RESULT);
    expect(d.agentSeatService.join).toHaveBeenCalledExactlyOnceWith("ABCD-EFGH", "claude opus 5.5", {
      lookup: { key: `agent-lookup:ip:${hashOpaqueToken("2.2.2.2")}`, limit: 20 },
      join: { key: `mcp-join:ip:${hashOpaqueToken("2.2.2.2")}`, limit: 10 },
    });
  });

  it("passes whatever shape the agent sent to the service, which judges it in one voice", async () => {
    const d = deps();
    await handleMcpPost(call({ code: 5, agentName: { x: 1 } }), d);
    expect(d.agentSeatService.join).toHaveBeenCalledWith(5, { x: 1 }, expect.anything());
  });

  it("passes a call without any arguments to the service too, instead of a protocol-level refusal", async () => {
    const d = deps();
    await handleMcpPost(modern("tools/call", { name: "join" }, "join"), d);
    expect(d.agentSeatService.join).toHaveBeenCalledWith(undefined, undefined, expect.anything());
    await handleMcpPost(call({}), d);
    expect(d.agentSeatService.join).toHaveBeenLastCalledWith(undefined, undefined, expect.anything());
  });

  it("serves a client of the 2025 stateless form too", async () => {
    const response = await handleMcpPost(
      post({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "join", arguments: { code: "ABCD-EFGH" } } }),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"gameId":"game-1"');
  });

  it.each([
    [new ValidationError("Zły kształt", { code: "INVALID_INPUT" }), "INVALID_INPUT", false],
    [new GoneError("Nieważne", { code: "INVALID_INVITATION" }), "INVALID_INVITATION", false],
    [new TooManyRequestsError("Za dużo", { retryAfterSeconds: 9 }), "RATE_LIMITED", true],
  ])("answers a service error as a tool error in one shape (%s)", async (error, code, retryable) => {
    const d = deps({ agentSeatService: { join: vi.fn().mockRejectedValue(error) } as never });

    const response = await handleMcpPost(call({ code: "ABCD-EFGH" }), d);

    expect(response.status).toBe(200);
    const { result } = (await response.json()) as { result: Record<string, unknown> };
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code, message: error.message, retryable } });
  });

  it("answers an unexpected error as an internal error without its message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const d = deps({
      agentSeatService: { join: vi.fn().mockRejectedValue(new Error("select ... ABCD-EFGH")) } as never,
    });

    const response = await handleMcpPost(call({ code: "ABCD-EFGH" }), d);

    const text = await response.text();
    expect(text).not.toContain("ABCD-EFGH");
    expect(text).toContain('"code":"INTERNAL"');
  });

  it("refuses another Origin with 403 before any limit is counted or tool is run", async () => {
    const d = deps();

    const response = await handleMcpPost(post({}, { origin: "https://evil.example" }), d);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { data: { code: "FORBIDDEN" } } });
    expect(d.rateLimiter.hit).not.toHaveBeenCalled();
    expect(d.agentSeatService.join).not.toHaveBeenCalled();
  });

  it("accepts its own Origin and requests without one", async () => {
    const own = await handleMcpPost(
      new Request(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-forwarded-for": "2.2.2.2",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/list",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } }),
      }),
      deps(),
    );
    expect(own.status).toBe(200);
  });

  it("allows only a localhost Origin when APP_ORIGIN is not set (development)", async () => {
    const dev = deps({}, {});
    const ok = await handleMcpPost(post({}, { origin: "http://localhost:3000", "x-forwarded-for": "2.2.2.2" }), dev);
    expect(ok.status).not.toBe(403);
    const refused = await handleMcpPost(post({}, { origin: "http://localhost.evil.example" }), dev);
    expect(refused.status).toBe(403);
  });

  it("refuses a body over 8 KB with 413 before parsing it", async () => {
    const response = await handleMcpPost(
      post(null, {}, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", pad: "x".repeat(MCP_BODY_MAX_BYTES) })),
      deps(),
    );
    expect(response.status).toBe(413);
  });

  it("refuses with 429 and Retry-After when the address has asked too often", async () => {
    const d = deps({
      rateLimiter: {
        hit: vi.fn(async () => {
          throw new TooManyRequestsError("Za dużo", { retryAfterSeconds: 17 });
        }),
      },
    });

    const response = await handleMcpPost(call({ code: "ABCD-EFGH" }), d);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await response.json()).toMatchObject({ error: { data: { code: "RATE_LIMITED" } } });
    expect(d.agentSeatService.join).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the address is unknown in production", async () => {
    const d = deps();
    const request = new Request(`${ORIGIN}/api/mcp`, { method: "POST", body: "{}" });

    const response = await handleMcpPost(request, d);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { data: { code: "ADDRESS_UNAVAILABLE" } } });
    expect(d.rateLimiter.hit).not.toHaveBeenCalled();
  });
});

describe("methodNotAllowed", () => {
  it("is 405 with Allow: POST", async () => {
    const response = methodNotAllowed();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32000, data: { code: "METHOD_NOT_ALLOWED" } },
    });
  });
});
