import { MCP_REQUEST_WINDOW_MS, TooManyRequestsError } from "@gomoku/core";
import { describe, expect, it, vi } from "vitest";

import { hashOpaqueToken } from "../http/opaque-token";
import { agentJoinGuard, limitRequests } from "./mcp-guards";

const mcp = { requestLimit: 300, joinLimit: 10, lookupLimit: 20, lookupGlobalLimit: 300 };
const config = { production: true, trustProxyHops: 1, clientIpHeader: "x-forwarded-for", mcp } as const;
const known = new Headers({ "x-forwarded-for": "2.2.2.2" });
const hashed = hashOpaqueToken("2.2.2.2");

describe("agentJoinGuard", () => {
  it("counts failed codes in the agents' own pool and joins per address", () => {
    expect(agentJoinGuard(known, config)).toEqual({
      lookup: { key: `agent-lookup:ip:${hashed}`, limit: 20 },
      join: { key: `mcp-join:ip:${hashed}`, limit: 10 },
    });
  });

  it("never uses the pool of the browsers", () => {
    const guard = agentJoinGuard(known, config);
    expect(guard.lookup.key).not.toContain("invitation-lookup");
  });

  it("takes the configured values", () => {
    const guard = agentJoinGuard(known, { ...config, mcp: { ...mcp, joinLimit: 3, lookupLimit: 7 } });
    expect(guard.join.limit).toBe(3);
    expect(guard.lookup.limit).toBe(7);
  });

  it("falls back to the global pool of failed codes when the address is unknown (outside production)", () => {
    const guard = agentJoinGuard(new Headers(), { ...config, production: false });
    expect(guard.lookup).toEqual({ key: "agent-lookup:global", limit: 300 });
    expect(guard.join).toEqual({ key: "mcp-join:ip:local", limit: 10 });
  });
});

describe("limitRequests", () => {
  it("counts the request per address against the configured limit", async () => {
    const rateLimiter = { hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 60 })) };

    await expect(limitRequests(rateLimiter, known, config)).resolves.toBeNull();

    expect(rateLimiter.hit).toHaveBeenCalledExactlyOnceWith(`mcp:ip:${hashed}`, 300, MCP_REQUEST_WINDOW_MS);
  });

  it("refuses when the limit is spent, with the time to wait", async () => {
    const rateLimiter = {
      hit: vi.fn(async () => {
        throw new TooManyRequestsError("Za dużo", { retryAfterSeconds: 42 });
      }),
    };
    await expect(limitRequests(rateLimiter, known, config)).resolves.toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 42,
    });
  });

  it("falls back to one second when the limiter gives no wait", async () => {
    const rateLimiter = {
      hit: vi.fn(async () => {
        throw new TooManyRequestsError("Za dużo");
      }),
    };
    await expect(limitRequests(rateLimiter, known, config)).resolves.toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 1,
    });
  });

  it("fails closed in production when the address is unknown, without touching the limiter", async () => {
    const rateLimiter = { hit: vi.fn() };
    await expect(limitRequests(rateLimiter, new Headers(), config)).resolves.toEqual({
      kind: "address-unavailable",
    });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("lets other errors of the limiter through", async () => {
    const boom = new Error("db down");
    const rateLimiter = { hit: vi.fn().mockRejectedValue(boom) };
    await expect(limitRequests(rateLimiter, known, config)).rejects.toBe(boom);
  });
});
