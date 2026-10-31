import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { handleMcpPost, methodNotAllowed } from "@/server/mcp/mcp-endpoint";

/**
 * The MCP endpoint of agents (E06-S01, D-29): `join` in this version. A single URL, stateless:
 * `POST` carries the protocol; `GET` (stream) and `DELETE` (session) are `405`. It does not go
 * through `apiHandler` (its envelope and CSRF header are for the browser).
 */
export async function POST(request: Request) {
  await connection();
  return withRequestScope(({ cradle }) =>
    handleMcpPost(request, {
      serverConfig: cradle.serverConfig,
      rateLimiter: cradle.rateLimiter,
      agentSeatService: cradle.agentSeatService,
    }),
  );
}

export function GET() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
