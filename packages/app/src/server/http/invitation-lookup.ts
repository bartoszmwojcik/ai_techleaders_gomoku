import {
  INVITATION_LOOKUP_GLOBAL_LIMIT,
  INVITATION_LOOKUP_LIMIT,
} from "@gomoku/core";

import type { ServerConfig } from "../config";
import type { LookupGuard } from "../services/games/invitation-service";
import { clientAddress } from "./client-address";
import { hashOpaqueToken } from "./opaque-token";

type LookupConfig = Pick<
  ServerConfig,
  "production" | "trustProxyHops" | "clientIpHeader"
>;

/**
 * The pool that counts failed invitation-code lookups for this request (#21 Q13): per client
 * address (hashed, no personal data) while the address is known, otherwise one global pool,
 * so an unreliable address never lets a guesser walk around the limit.
 */
export function lookupGuard(
  headers: Headers,
  config: LookupConfig,
): LookupGuard {
  const address = clientAddress(headers, config);
  if (address === undefined) {
    return {
      key: "invitation-lookup:global",
      limit: INVITATION_LOOKUP_GLOBAL_LIMIT,
    };
  }
  return {
    key: `invitation-lookup:ip:${hashOpaqueToken(address)}`,
    limit: INVITATION_LOOKUP_LIMIT,
  };
}
