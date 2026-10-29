import { INVITATION_LOOKUP_GLOBAL_LIMIT, INVITATION_LOOKUP_LIMIT } from "@gomoku/core";
import { describe, expect, it } from "vitest";

import { lookupGuard } from "./invitation-lookup";
import { hashOpaqueToken } from "./opaque-token";

const config = {
  production: true,
  trustProxyHops: 1,
  clientIpHeader: "x-forwarded-for",
} as const;

describe("lookupGuard", () => {
  it("uses a per-address pool keyed by the hash of the address", () => {
    const guard = lookupGuard(new Headers({ "x-forwarded-for": "9.9.9.9, 2.2.2.2" }), config);
    expect(guard).toEqual({
      key: `invitation-lookup:ip:${hashOpaqueToken("2.2.2.2")}`,
      limit: INVITATION_LOOKUP_LIMIT,
    });
    expect(guard.key).not.toContain("2.2.2.2");
  });

  it("falls back to the global pool when the address is not trustworthy", () => {
    expect(lookupGuard(new Headers(), config)).toEqual({
      key: "invitation-lookup:global",
      limit: INVITATION_LOOKUP_GLOBAL_LIMIT,
    });
    expect(
      lookupGuard(new Headers({ "x-forwarded-for": "2.2.2.2" }), { ...config, trustProxyHops: undefined }),
    ).toMatchObject({ key: "invitation-lookup:global" });
  });
});
