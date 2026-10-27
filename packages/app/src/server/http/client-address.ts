import { isIP } from "node:net";

import type { ServerConfig } from "../config";
import { hashOpaqueToken } from "./opaque-token";

type ClientAddressConfig = Pick<
  ServerConfig,
  "production" | "trustProxyHops" | "clientIpHeader"
>;

function expandIPv6(address: string): string[] {
  const [head = "", tail] = address.split("::");
  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === undefined || tail === "" ? [] : tail.split(":");
  const zeros = Array.from(
    { length: 8 - headParts.length - tailParts.length },
    () => "0",
  );
  const parts =
    tail === undefined ? headParts : [...headParts, ...zeros, ...tailParts];
  return parts.map((part) => part.toLowerCase().replace(/^0+(?=.)/, ""));
}

/**
 * Normalizes a candidate address: IPv4 stays as is (a port is dropped), IPv6 is reduced to
 * its /64 prefix (one IPv6 host owns a whole /64), IPv4-mapped IPv6 becomes IPv4.
 * Returns `undefined` for anything that is not an IP address.
 */
function normalizeAddress(raw: string): string | undefined {
  let value = raw.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed?.[1]) value = bracketed[1];
  else if (/^[^:]+:\d+$/.test(value))
    value = value.slice(0, value.lastIndexOf(":"));
  value = value.replace(/%.*$/, "");

  if (isIP(value) === 4) return value;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
  if (mapped?.[1] && isIP(mapped[1]) === 4) return mapped[1];
  if (isIP(value) === 6)
    return `${expandIPv6(value).slice(0, 4).join(":")}::/64`;
  return undefined;
}

/**
 * Client address from the configured header. `x-forwarded-for` is read from the right: with
 * `trustProxyHops = n` the n-th entry from the end was added by our own proxy, and entries
 * to its left are set by the client and never trusted. Single-value headers are taken as is.
 */
export function clientAddress(
  headers: Headers,
  config: ClientAddressConfig,
): string | undefined {
  const value = headers.get(config.clientIpHeader);
  if (value === null) return undefined;
  if (config.clientIpHeader !== "x-forwarded-for")
    return normalizeAddress(value);
  if (config.trustProxyHops === undefined) return undefined;
  const entries = value.split(",");
  const entry = entries[entries.length - config.trustProxyHops];
  return entry === undefined ? undefined : normalizeAddress(entry);
}

/**
 * Rate-limit key `<scope>:ip:<sha256(address)>`: no personal data and a fixed length.
 * An unknown address fails closed in production (throws, so the route answers 500) instead
 * of sharing one counter between all clients; elsewhere it falls back to `<scope>:ip:local`.
 */
export function clientKey(
  headers: Headers,
  scope: string,
  config: ClientAddressConfig,
): string {
  const address = clientAddress(headers, config);
  if (address !== undefined) return `${scope}:ip:${hashOpaqueToken(address)}`;
  if (config.production)
    throw new Error("Client address is unavailable behind the proxy.");
  return `${scope}:ip:local`;
}
