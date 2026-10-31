import { MCP_BODY_MAX_BYTES } from "@gomoku/core";
import { createMcpHandler } from "@modelcontextprotocol/server";

import type { ServerConfig } from "../config";
import type { AgentSeatService } from "../services/games/agent-seat-service";
import type { RateLimiter } from "../services/rate-limit/rate-limiter";
import { agentJoinGuard, limitRequests } from "./mcp-guards";
import { createGomokuMcpServer } from "./mcp-server";

const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;

export type McpEndpointDeps = {
  serverConfig: ServerConfig;
  rateLimiter: Pick<RateLimiter, "hit">;
  agentSeatService: Pick<AgentSeatService, "join">;
};

/** A JSON-RPC error body for a refusal before the protocol layer; `reason` is the machine-readable code. */
function jsonRpcError(
  status: number,
  message: string,
  reason: string,
  headers: HeadersInit = {},
): Response {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message, data: { code: reason } } },
    { status, headers },
  );
}

/** `405` for the methods the endpoint does not serve (`GET` stream, `DELETE` session: stateless). */
export function methodNotAllowed(): Response {
  return jsonRpcError(405, "Metoda niedozwolona. Użyj POST.", "METHOD_NOT_ALLOWED", { Allow: "POST" });
}

/**
 * `Origin` check of the MCP transport: a browser request from another origin is refused (`403`);
 * clients that are not browsers send no `Origin`. Only `APP_ORIGIN` is allowed (outside
 * production without it: `http://localhost:<port>`). The CSRF header of `apiHandler` is not
 * used: the endpoint reads no cookie and no session.
 */
function originAllowed(request: Request, config: Pick<ServerConfig, "appOrigin">): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  return config.appOrigin === undefined ? LOCALHOST_ORIGIN.test(origin) : origin === config.appOrigin;
}

/**
 * `POST /api/mcp` (D-29): Streamable HTTP of MCP 2026-07-28 (also the stateless 2025 form),
 * served by the SDK's `createMcpHandler`. Order: `Origin` (403), the per-address request limit
 * (429, 503 when the address is unknown in production), the SDK: body limit (413), JSON-RPC,
 * the tools. Nothing here reads a cookie or a session.
 */
export async function handleMcpPost(request: Request, deps: McpEndpointDeps): Promise<Response> {
  const { serverConfig, rateLimiter, agentSeatService } = deps;
  if (!originAllowed(request, serverConfig)) {
    return jsonRpcError(403, "Żądanie odrzucone.", "FORBIDDEN");
  }
  const refusal = await limitRequests(rateLimiter, request.headers, serverConfig);
  if (refusal?.kind === "address-unavailable") {
    return jsonRpcError(503, "Nie można ustalić adresu klienta.", "ADDRESS_UNAVAILABLE");
  }
  if (refusal?.kind === "rate-limited") {
    return jsonRpcError(429, "Zbyt wiele żądań. Spróbuj ponownie później.", "RATE_LIMITED", {
      "Retry-After": String(refusal.retryAfterSeconds),
    });
  }
  const handler = createMcpHandler(
    () =>
      createGomokuMcpServer({
        agentSeatService,
        guard: () => agentJoinGuard(request.headers, serverConfig),
      }),
    { maxRequestBodySize: MCP_BODY_MAX_BYTES },
  );
  // Per request and holding nothing between requests (no sessions), so there is nothing to close.
  return handler.fetch(request);
}
