import { MCP_REQUEST_WINDOW_MS, TooManyRequestsError } from "@gomoku/core";

import type { ServerConfig } from "../config";
import { clientAddress, clientKey } from "../http/client-address";
import { hashOpaqueToken } from "../http/opaque-token";
import type { AgentJoinGuard } from "../services/games/agent-seat-service";
import type { RateLimiter } from "../services/rate-limit/rate-limiter";

type GuardConfig = Pick<ServerConfig, "production" | "trustProxyHops" | "clientIpHeader" | "mcp">;

/**
 * The pools of one `join` (D-29, R3). Failed codes of agents have a pool of their own
 * (`agent-lookup:*`, never `invitation-lookup:*`): per client address while it is known,
 * otherwise one global pool. Successful joins are counted per address (`mcp-join:ip:*`); an
 * unknown address in production never reaches here (`limitRequests` refuses it first).
 */
export function agentJoinGuard(headers: Headers, config: GuardConfig): AgentJoinGuard {
  const address = clientAddress(headers, config);
  const { mcp } = config;
  return {
    lookup:
      address === undefined
        ? { key: "agent-lookup:global", limit: mcp.lookupGlobalLimit }
        : { key: `agent-lookup:ip:${hashOpaqueToken(address)}`, limit: mcp.lookupLimit },
    join: { key: clientKey(headers, "mcp-join", config), limit: mcp.joinLimit },
  };
}

/** Why a request got no answer from the tools: the address is unknown or has asked too often. */
export type RequestRefusal =
  | { kind: "address-unavailable" }
  | { kind: "rate-limited"; retryAfterSeconds: number };

/**
 * Per-address limit of requests to the endpoint, every method included (R3: 300 per minute by
 * default). Fail-closed: in production an address that cannot be read from the proxy header
 * is refused instead of sharing one counter between all clients (`clientKey` throws).
 */
export async function limitRequests(
  rateLimiter: Pick<RateLimiter, "hit">,
  headers: Headers,
  config: GuardConfig,
): Promise<RequestRefusal | null> {
  let key: string;
  try {
    key = clientKey(headers, "mcp", config);
  } catch {
    return { kind: "address-unavailable" };
  }
  try {
    await rateLimiter.hit(key, config.mcp.requestLimit, MCP_REQUEST_WINDOW_MS);
    return null;
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      return { kind: "rate-limited", retryAfterSeconds: error.retryAfterSeconds ?? 1 };
    }
    throw error;
  }
}

